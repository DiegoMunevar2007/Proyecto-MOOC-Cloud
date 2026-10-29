package courses

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"strconv"
	"strings"
)

// ListMine lista todos los estados únicamente del autor autenticado.
// @Summary Cursos propios, incluidos borradores
// @Tags Cursos
// @Produce json
// @Security BearerAuth
// @Success 200 {object} CoursesResponse
// @Router /api/v1/courses/mine [get]
func (h *Handler) ListMine(c *gin.Context) {
	uid, _ := currentUser(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	limit := 50
	q := h.DB.Model(&Course{}).Where("created_by_id = ? AND deleted_at IS NULL", uid)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		writeErr(c, err)
		return
	}
	items := []Course{}
	if err := q.Order("updated_at desc, id desc").Limit(limit).Offset((page - 1) * limit).Find(&items).Error; err != nil {
		writeErr(c, err)
		return
	}
	c.JSON(200, CoursesResponse{Courses: items, Total: total, Page: page, Limit: limit})
}

func UpdateModule(db *gorm.DB, id, uid uint, role string, in CreateModuleRequest) (*Module, error) {
	m, v, c, err := moduleChain(db, id)
	if err != nil {
		return nil, err
	}
	if err := mustEditable(c, v, uid, role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Title) == "" {
		return nil, ErrInvalidPayload
	}
	m.Title = strings.TrimSpace(in.Title)
	m.Description = in.Description
	return m, db.Save(m).Error
}
func UpdateUnit(db *gorm.DB, id, uid uint, role string, in CreateUnitRequest) (*Unit, error) {
	u, _, v, c, err := unitChain(db, id)
	if err != nil {
		return nil, err
	}
	if err := mustEditable(c, v, uid, role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Title) == "" {
		return nil, ErrInvalidPayload
	}
	u.Title = strings.TrimSpace(in.Title)
	u.Description = in.Description
	return u, db.Save(u).Error
}

// EditModule modifica un módulo del borrador propio.
// @Summary Editar módulo
// @Tags Cursos
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Módulo"
// @Param body body CreateModuleRequest true "Metadatos"
// @Success 200 {object} ModuleEnvelope
// @Router /api/v1/modules/{id} [put]
func (h *Handler) EditModule(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	uid, role := currentUser(c)
	var in CreateModuleRequest
	if c.ShouldBindJSON(&in) != nil {
		writeErr(c, ErrInvalidPayload)
		return
	}
	m, err := UpdateModule(h.DB, uint(id), uid, role, in)
	if err != nil {
		writeErr(c, err)
		return
	}
	c.JSON(200, ModuleEnvelope{Module: *m})
}

// EditUnit modifica una unidad del borrador propio.
// @Summary Editar unidad
// @Tags Cursos
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "Unidad"
// @Param body body CreateUnitRequest true "Metadatos"
// @Success 200 {object} UnitEnvelope
// @Router /api/v1/units/{id} [put]
func (h *Handler) EditUnit(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	uid, role := currentUser(c)
	var in CreateUnitRequest
	if c.ShouldBindJSON(&in) != nil {
		writeErr(c, ErrInvalidPayload)
		return
	}
	u, err := UpdateUnit(h.DB, uint(id), uid, role, in)
	if err != nil {
		writeErr(c, err)
		return
	}
	c.JSON(200, UnitEnvelope{Unit: *u})
}

// ResourceAvailable impide servir originales sin escanear o medios sin HLS.
func ResourceAvailable(r *Resource) bool {
	if IsMediaType(r.Type) {
		return r.ScanStatus == ScanClean && r.ProcessingStatus == ProcessingReady && r.HLSKey != ""
	}
	return r.ObjectKey != "" && r.ScanStatus == ScanClean && r.ProcessingStatus != ProcessingFailed
}
