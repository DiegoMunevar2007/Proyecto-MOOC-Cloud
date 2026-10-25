package progress

import (
	"errors"
	"log"

	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/badges"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/courses"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/enroll"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/quiz"
	"gorm.io/gorm"
)

// ErrClientProgress indica manipulación: el cliente envió avance declarado.
var ErrClientProgress = errors.New("el progreso lo calcula el servidor; percent/completed no se aceptan")

// stableCourse resuelve recurso + curso verificando inscripción o propiedad.
func stableCourse(db *gorm.DB, studentID uint, stableID string) (*courses.Resource, *courses.Course, error) {
	r, err := courses.ByStableID(db, stableID)
	if err != nil {
		return nil, nil, err
	}
	_, c, _, err := courses.LocateResource(db, r.ID)
	if err != nil {
		return nil, nil, err
	}
	if !enroll.IsEnrolled(db, studentID, c.ID) && !courses.IsOwnerOrAdmin(c, studentID, "") {
		return nil, nil, courses.ErrForbidden
	}
	return r, c, nil
}

// Heartbeat registra reproducción/apertura. Completed es monótono (nunca retrocede).
func Heartbeat(db *gorm.DB, studentID uint, in HeartbeatInput) (*Progress, error) {
	if in.Percent != nil || in.Completed != nil {
		log.Printf("AUDIT progreso manipulado student=%d stable=%s", studentID, in.StableID)
		return nil, ErrClientProgress
	}
	if in.StableID == "" || in.PositionSec < 0 || in.DurationSec < 0 || in.Page < 0 || in.TotalPages < 0 {
		return nil, courses.ErrInvalidPayload
	}
	r, _, err := stableCourse(db, studentID, in.StableID)
	if err != nil {
		return nil, err
	}
	var p Progress
	if err := db.Where("student_id = ? AND stable_id = ?", studentID, in.StableID).First(&p).Error; err != nil {
		p = Progress{StudentID: studentID, StableID: in.StableID}
	}
	if in.PositionSec > p.PositionSec {
		p.PositionSec = in.PositionSec
	}
	if in.DurationSec > 0 {
		p.DurationSec = in.DurationSec
	}
	if in.Page > p.Page {
		p.Page = in.Page
	}
	if in.TotalPages > 0 {
		p.TotalPages = in.TotalPages
	}
	if !p.Completed {
		p.Completed = complete(r.Type, p.PositionSec, p.DurationSec, in.Event)
	}
	if p.ID == 0 {
		err = db.Create(&p).Error
	} else {
		err = db.Save(&p).Error
	}
	return &p, err
}

// complete decide finalización: multimedia exige ≥90% de duración;
// el resto se completa al abrirse (evento explícito del reproductor/visor).
func complete(resourceType string, position, duration int, event string) bool {
	switch courses.NormalizeResourceType(resourceType) {
	case courses.ResourceTypeVideo, courses.ResourceTypeAudio:
		return duration > 0 && position*10 >= duration*9
	default:
		switch event {
		case "open", "playing", "pdf_open":
			return true
		}
		return false
	}
}

// Position retorna la última posición reportada (visor/reproductor),
// incluyendo recursos no visibles ni obligatorios.
func Position(db *gorm.DB, studentID uint, stableID string) (*Progress, error) {
	if _, _, err := stableCourse(db, studentID, stableID); err != nil {
		return nil, err
	}
	var p Progress
	if err := db.Where("student_id = ? AND stable_id = ?", studentID, stableID).First(&p).Error; err != nil {
		return nil, courses.ErrNotFound
	}
	return &p, nil
}

// progressResource es lo mínimo del árbol que necesita el cálculo de avance.
type progressResource struct {
	ID       uint
	StableID string
	Type     string
}

// CourseProgress calcula el avance sobre recursos obligatorios visibles de la
// versión vigente, actualiza Matricula.Status y emite la insignia al aprobar.
// Hace un número constante de consultas: recursos, progreso del estudiante e
// intentos aprobados. Antes recorría el árbol y lanzaba una consulta por
// recurso más dos por quiz.
func CourseProgress(db *gorm.DB, studentID, courseID uint) (*CourseProgressResponse, error) {
	if !enroll.IsEnrolled(db, studentID, courseID) {
		return nil, courses.ErrForbidden
	}
	var c courses.Course
	if err := db.First(&c, courseID).Error; err != nil {
		return nil, courses.ErrNotFound
	}
	var v courses.CourseVersion
	if c.CurrentVersionID == nil {
		if err := db.Where("course_id = ?", courseID).Order("number desc").First(&v).Error; err != nil {
			return nil, courses.ErrNotFound
		}
	} else if err := db.First(&v, *c.CurrentVersionID).Error; err != nil {
		return nil, courses.ErrNotFound
	}

	var resources []progressResource
	if err := db.Table("resources").
		Select("resources.id, resources.stable_id, resources.type").
		Joins("JOIN units ON units.id = resources.unit_id").
		Joins("JOIN modules ON modules.id = units.module_id").
		Where("modules.course_version_id = ? AND resources.is_visible AND resources.is_required", v.ID).
		Scan(&resources).Error; err != nil {
		return nil, err
	}

	stableIDs := make([]string, 0, len(resources))
	quizIDs := make([]uint, 0, len(resources))
	for _, r := range resources {
		stableIDs = append(stableIDs, r.StableID)
		if courses.NormalizeResourceType(r.Type) == courses.ResourceTypeQuiz {
			quizIDs = append(quizIDs, r.ID)
		}
	}

	positions := map[string]PositionInfo{}
	completed := map[string]bool{}
	if len(stableIDs) > 0 {
		var rows []Progress
		if err := db.Where("student_id = ? AND stable_id IN ?", studentID, stableIDs).Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, p := range rows {
			completed[p.StableID] = p.Completed
			positions[p.StableID] = PositionInfo{PositionSec: p.PositionSec, DurationSec: p.DurationSec, Page: p.Page, Completed: p.Completed}
		}
	}

	passedQuizzes := map[uint]bool{}
	if len(quizIDs) > 0 {
		var ids []uint
		if err := db.Table("attempts").
			Joins("JOIN quizzes ON quizzes.id = attempts.quiz_id").
			Where("attempts.student_id = ? AND attempts.status = ? AND attempts.score >= ? AND quizzes.resource_id IN ?",
				studentID, quiz.AttemptSubmitted, v.MinRequiredPct, quizIDs).
			Group("quizzes.resource_id").
			Pluck("quizzes.resource_id", &ids).Error; err != nil {
			return nil, err
		}
		for _, id := range ids {
			passedQuizzes[id] = true
		}
	}

	total, done := 0, 0
	allQuizPassed := true
	for _, r := range resources {
		total++
		// Los quizzes se completan por aprobación, no por heartbeat.
		if courses.NormalizeResourceType(r.Type) == courses.ResourceTypeQuiz {
			if !passedQuizzes[r.ID] {
				allQuizPassed = false
				continue
			}
			done++
			continue
		}
		if completed[r.StableID] {
			done++
		}
	}
	pct := 0
	if total > 0 {
		pct = done * 100 / total
	}
	status := StatusInProgress
	if total > 0 && done == total {
		status = StatusCompleted
	}
	badgeCode := ""
	if status == StatusCompleted && allQuizPassed {
		status = StatusApproved
		if b, err := badges.EnsureBadge(db, studentID, courseID); err == nil {
			badgeCode = b.Code
		}
	}
	_ = db.Model(&courses.Matricula{}).Where("student_id = ? AND course_id = ?", studentID, courseID).Update("status", status).Error
	return &CourseProgressResponse{Total: total, Done: done, Percent: pct, Status: status, Badge: badgeCode, Positions: positions}, nil
}
