import { useEffect, useState } from "react";
import { Link } from "react-router";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCover } from "@/components/course-cover";
import { EmptyState } from "@/components/empty-state";
import { api, ApiError, type Course, type CourseDetail, type Enrollment, type Progreso } from "@/lib/api";
import { ESTADOS } from "@/lib/cursos";
import { useInscripciones } from "@/lib/inscripciones";
import { useTitle } from "@/lib/use-title";

interface Fila {
  inscripcion: Enrollment;
  curso: Course | null;
  progreso: Progreso | null;
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

function FilaCurso({ fila, onCambio }: { fila: Fila; onCambio: () => Promise<void> }) {
  const { inscripcion, curso, progreso } = fila;
  const titulo = curso?.title ?? `Curso ${inscripcion.course_id}`;
  const [trabajando, setTrabajando] = useState(false);

  async function cambiar(ruta: string, metodo: "POST" | "DELETE", exito: string) {
    setTrabajando(true);
    try {
      await api(ruta, { method: metodo });
      await onCambio();
      toast.success(exito);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo completar la acción");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <li className="flex gap-4 rounded-2xl border bg-card p-3 sm:p-4">
      <Link to={`/cursos/${inscripcion.course_id}`} tabIndex={-1} aria-hidden="true" className="hidden w-48 shrink-0 self-start overflow-hidden rounded-xl sm:block">
        <CourseCover id={inscripcion.course_id} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/cursos/${inscripcion.course_id}`}
              className="font-heading text-xl leading-snug font-semibold underline-offset-4 hover:underline"
            >
              {titulo}
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">Inscrito el {fecha(inscripcion.fecha_inscripcion)}</p>
          </div>
          {inscripcion.inscrito ? (
            <Badge variant="secondary" className="h-6 shrink-0">
              {ESTADOS[inscripcion.status] ?? inscripcion.status}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 shrink-0">
              Retirado
            </Badge>
          )}
        </div>

        {inscripcion.inscrito && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {progreso && progreso.total > 0 ? `${progreso.done} de ${progreso.total} recursos` : "Sin avance todavía"}
              </span>
              <span className="font-medium tabular-nums">{progreso?.percent ?? 0}%</span>
            </div>
            <Progress value={progreso?.percent ?? 0} aria-label={`Avance en ${titulo}`} />
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {inscripcion.inscrito ? (
            <>
              <Button asChild size="sm">
                <Link to={`/cursos/${inscripcion.course_id}`}>Ir al curso</Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={trabajando}>
                    Retirarme
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Retirarte de «{titulo}»?</AlertDialogTitle>
                    <AlertDialogDescription>Conservas tu avance, y puedes volver a inscribirte cuando quieras.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cambiar(`/api/v1/enrollments/${inscripcion.course_id}`, "DELETE", "Te retiraste del curso")}>
                      Retirarme
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={trabajando}
              onClick={() => cambiar(`/api/v1/enrollments/${inscripcion.course_id}/reenroll`, "POST", "Volviste a inscribirte")}
            >
              Volver a inscribirme
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function MisCursos() {
  useTitle("Mis cursos");
  const { lista, refrescar } = useInscripciones();
  const [filas, setFilas] = useState<Fila[] | null>(null);

  // La inscripción solo trae el id del curso: título y avance salen de sus
  // propios endpoints. Mientras se refrescan se conserva lo que ya se mostraba.
  useEffect(() => {
    if (lista === null) return;
    let vigente = true;
    Promise.all(
      lista.map(async (inscripcion) => {
        const [curso, progreso] = await Promise.all([
          api<CourseDetail>(`/api/v1/courses/${inscripcion.course_id}`).then((r) => r.data.course).catch(() => null),
          inscripcion.inscrito
            ? api<Progreso>(`/api/v1/progress/${inscripcion.course_id}`).then((r) => r.data).catch(() => null)
            : Promise.resolve(null),
        ]);
        return { inscripcion, curso, progreso };
      }),
    ).then((resultado) => vigente && setFilas(resultado)).catch(() => {
      if (vigente) toast.error("No se pudieron cargar tus cursos. Vuelve a intentarlo.");
    });
    return () => {
      vigente = false;
    };
  }, [lista]);

  const ordenadas = [...(filas ?? [])].sort((a, b) => Number(b.inscripcion.inscrito) - Number(a.inscripcion.inscrito));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Mis cursos</h1>
      <p className="mt-2 text-muted-foreground">Retoma donde te quedaste.</p>

      <div className="mt-8">
        {filas === null && (
          <div className="space-y-4" aria-hidden="true">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        )}
        {filas !== null && filas.length === 0 && (
          <EmptyState
            icono={GraduationCap}
            titulo="Todavía no estás inscrito en ningún curso"
            accion={
              <Button asChild>
                <Link to="/">Explorar el catálogo</Link>
              </Button>
            }
          >
            Cuando te inscribas, tus cursos y tu avance aparecerán aquí.
          </EmptyState>
        )}
        {filas !== null && filas.length > 0 && (
          <ul className="space-y-4">
            {ordenadas.map((f) => (
              <FilaCurso key={f.inscripcion.id} fila={f} onCambio={refrescar} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
