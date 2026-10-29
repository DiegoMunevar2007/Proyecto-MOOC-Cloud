package integration_test

import (
	"errors"
	"fmt"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/auth"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/courses"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/quiz"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func database(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("POSTGRES_TEST_DSN")
	if dsn == "" {
		t.Skip("POSTGRES_TEST_DSN requerido")
	}
	admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("mooc_authoring_test_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(postgres.Open(dsn+" search_path="+schema), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sql, e := db.DB(); e == nil {
			sql.Close()
		}
		admin.Exec("DROP SCHEMA " + schema + " CASCADE")
		if sql, e := admin.DB(); e == nil {
			sql.Close()
		}
	})
	if err := db.AutoMigrate(&auth.UserModel{}, &courses.Course{}, &courses.CourseVersion{}, &courses.Module{}, &courses.Unit{}, &courses.Resource{}, &courses.Matricula{}, &quiz.Quiz{}, &quiz.Question{}, &quiz.Attempt{}); err != nil {
		t.Fatal(err)
	}
	return db
}
func TestAuthoringOwnershipPublicationAndQuiz(t *testing.T) {
	db := database(t)
	owner := auth.UserModel{Username: "prof", Email: "prof@test", Password: "unused", Role: "professor"}
	other := auth.UserModel{Username: "other", Email: "other@test", Password: "unused", Role: "professor"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	course, _, err := courses.CreateCourse(db, owner.ID, "Curso", "curso", "Descripción", "", 80)
	if err != nil {
		t.Fatal(err)
	}
	mod, err := courses.AddModule(db, course.ID, owner.ID, "professor", "Módulo", "")
	if err != nil {
		t.Fatal(err)
	}
	unit, err := courses.AddUnit(db, mod.ID, owner.ID, "professor", "Unidad", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := courses.UpdateModule(db, mod.ID, other.ID, "professor", courses.CreateModuleRequest{Title: "Robado"}); !errors.Is(err, courses.ErrForbidden) {
		t.Fatalf("edición ajena: %v", err)
	}
	if _, err := courses.UpdateUnit(db, unit.ID, owner.ID, "professor", courses.CreateUnitRequest{Title: "Editada"}); err != nil {
		t.Fatal(err)
	}
	resource, err := courses.AddResource(db, unit.ID, owner.ID, "professor", courses.ResourceInput{Type: "quiz", Title: "Evaluación"})
	if err != nil {
		t.Fatal(err)
	}
	if issues := courses.ValidatePublishable(db, course.ID); len(issues) == 0 {
		t.Fatal("publicó quiz sin preguntas")
	}
	q, err := quiz.CreateQuiz(db, owner.ID, "professor", resource.ID, 3, nil, "on_submit")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := quiz.AddQuestions(db, owner.ID, "professor", q.ID, []quiz.QuestionInput{{Prompt: "Pregunta", Choices: []string{"A", "B"}, CorrectIndex: 0}}); err != nil {
		t.Fatal(err)
	}
	// El upload debe rechazar a otro profesor antes de tocar almacenamiento/cola.
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := courses.Handler{DB: db}
	router.POST("/resources/:id/upload-url", func(c *gin.Context) { c.Set("user_id", other.ID); c.Set("role", "professor"); handler.UploadURL(c) })
	request := httptest.NewRequest("POST", fmt.Sprintf("/resources/%d/upload-url", resource.ID), strings.NewReader(`{"object_key":"ajeno","size_bytes":10}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 403 {
		t.Fatalf("upload ajeno=%d: %s", response.Code, response.Body)
	}
	if _, err := courses.PublishVersion(db, course.ID, owner.ID, "professor"); err != nil {
		t.Fatal(err)
	}
	if _, err := courses.UpdateUnit(db, unit.ID, owner.ID, "professor", courses.CreateUnitRequest{Title: "Cambio publicado"}); !errors.Is(err, courses.ErrImmutable) {
		t.Fatalf("mutó versión publicada: %v", err)
	}
}
func TestUnavailableFilesRemainPrivate(t *testing.T) {
	for _, r := range []courses.Resource{
		{Type: "pdf", ObjectKey: "doc.pdf", ScanStatus: "pending"},
		{Type: "video", ObjectKey: "a.mp4", ScanStatus: "clean", ProcessingStatus: "processing"},
		{Type: "video", ObjectKey: "a.mp4", ScanStatus: "infected", ProcessingStatus: "ready", HLSKey: "x/index.m3u8"},
	} {
		if courses.ResourceAvailable(&r) {
			t.Fatalf("recurso no disponible autorizado: %+v", r)
		}
	}
	if !courses.ResourceAvailable(&courses.Resource{Type: "video", ScanStatus: "clean", ProcessingStatus: "ready", HLSKey: "x/index.m3u8"}) {
		t.Fatal("bloqueó HLS disponible")
	}
}
