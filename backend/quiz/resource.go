package quiz

import (
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/auth"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/courses"
	"github.com/DiegoMunevar2007/Proyecto-1-Cloud.git/enroll"
	"github.com/gin-gonic/gin"
	"strconv"
)

type ResourceQuizResponse struct {
	Quiz     Quiz              `json:"quiz"`
	Attempts []AttemptResponse `json:"attempts"`
}

// ResourceQuiz entrega reglas e intentos propios, nunca las claves de respuesta.
// @Summary Quiz asociado a un recurso
// @Tags Quizzes
// @Produce json
// @Security BearerAuth
// @Param id path int true "Recurso"
// @Success 200 {object} ResourceQuizResponse
// @Router /api/v1/resources/{id}/quiz [get]
func (h *Handler) ResourceQuiz(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	uid, role := auth.UserFromContext(c)
	r, course, _, err := courses.LocateResource(h.DB, uint(id))
	if err != nil {
		writeErr(c, err)
		return
	}
	if !courses.IsOwnerOrAdmin(course, uid, role) && (course.Status != courses.CourseStatusPublished || !r.IsVisible || !enroll.IsEnrolled(h.DB, uid, course.ID)) {
		writeErr(c, ErrForbidden)
		return
	}
	var q Quiz
	if h.DB.Where("resource_id = ?", r.ID).First(&q).Error != nil {
		writeErr(c, courses.ErrNotFound)
		return
	}
	attempts := []Attempt{}
	if err := h.DB.Where("quiz_id = ? AND student_id = ?", q.ID, uid).Order("id desc").Find(&attempts).Error; err != nil {
		writeErr(c, err)
		return
	}
	views := make([]AttemptResponse, 0, len(attempts))
	for i := range attempts {
		views = append(views, studentView(h.DB, &attempts[i]))
	}
	c.JSON(200, ResourceQuizResponse{Quiz: q, Attempts: views})
}
