import { useEffect, useState } from "react";
import { api, ApiError, type CourseDetail, type Enrollment } from "./api";

// Estados de Matricula.Status (backend/progress/progressmodels.go).
const ESTADOS: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completado",
  approved: "Aprobado",
};

interface Fila {
  inscripcion: Enrollment;
  titulo: string;
}

export function MisCursos() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const { data } = await api<{ enrollments: Enrollment[] }>("/api/v1/enrollments");
      // La inscripción solo trae el id del curso; el título sale del detalle.
      const conTitulo = await Promise.all(
        data.enrollments.map(async (inscripcion) => {
          try {
            const { data: d } = await api<CourseDetail>(`/api/v1/courses/${inscripcion.course_id}`);
            return { inscripcion, titulo: d.course.title };
          } catch {
            return { inscripcion, titulo: `Curso ${inscripcion.course_id}` };
          }
        }),
      );
      setFilas(conTitulo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar tus cursos");
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function retirarse(courseId: number) {
    try {
      await api(`/api/v1/enrollments/${courseId}`, { method: "DELETE" });
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo retirar la inscripción");
    }
  }

  return (
    <section>
      <h1>Mis cursos</h1>
      {error && <p className="error">{error}</p>}
      {!filas && !error && <p className="ayuda">Cargando…</p>}
      {filas && filas.length === 0 && <p className="ayuda">Todavía no estás inscrito en ningún curso.</p>}
      {filas && filas.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Curso</th>
              <th>Estado</th>
              <th>Inscripción</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ inscripcion, titulo }) => (
              <tr key={inscripcion.id}>
                <td>{titulo}</td>
                <td>{inscripcion.inscrito ? (ESTADOS[inscripcion.status] ?? inscripcion.status) : "Retirado"}</td>
                <td>{new Date(inscripcion.fecha_inscripcion).toLocaleDateString("es-CO")}</td>
                <td>
                  {inscripcion.inscrito && (
                    <button className="enlace" onClick={() => retirarse(inscripcion.course_id)}>
                      Retirarme
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
