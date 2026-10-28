import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Check, LayoutGrid, Layers, Percent, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCover } from "@/components/course-cover";
import { EmptyState } from "@/components/empty-state";
import { infoRecurso } from "@/components/recurso";
import { api, ApiError, type CourseDetail, type Progreso } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { plural, resumenCurso } from "@/lib/cursos";
import { useInscripciones } from "@/lib/inscripciones";
import { useTitle } from "@/lib/use-title";

function Dato({ icono: Icono, children }: { icono: typeof Layers; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <Icono className="size-4 text-muted-foreground" />
      {children}
    </li>
  );
}

function Inscripcion({ id, titulo }: { id: number; titulo: string }) {
  const { me } = useAuth();
  const { lista, activos, refrescar } = useInscripciones();
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const inscrito = activos.has(id);
  const retirado = lista?.some((i) => i.course_id === id && !i.inscrito) ?? false;

  useEffect(() => {
    if (!inscrito) {
      setProgreso(null);
      return;
    }
    api<Progreso>(`/api/v1/progress/${id}`)
      .then(({ data }) => setProgreso(data))
      .catch(() => setProgreso(null));
  }, [id, inscrito]);

  async function ejecutar(ruta: string, metodo: "POST" | "DELETE", exito: string, cuerpo?: object) {
    setTrabajando(true);
    try {
      await api(ruta, { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      await refrescar();
      toast.success(exito);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo completar la acción");
    } finally {
      setTrabajando(false);
    }
  }

  if (!me) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link to={`/ingresar?volver=${encodeURIComponent(`/cursos/${id}`)}`}>Ingresa para inscribirte</Link>
      </Button>
    );
  }

  if (me.role !== "student") {
    return (
      <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
        Estás viendo el curso como {ROLES[me.role]?.toLowerCase() ?? me.role}. Solo los estudiantes pueden inscribirse.
      </p>
    );
  }

  if (inscrito) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-medium">
          <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-4" />
          </span>
          Estás inscrito
        </p>
        {progreso && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tu avance</span>
              <span className="font-medium tabular-nums">{progreso.percent}%</span>
            </div>
            <Progress value={progreso.percent} aria-label="Avance del curso" />
          </div>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full text-muted-foreground" disabled={trabajando}>
              Retirarme del curso
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Retirarte de «{titulo}»?</AlertDialogTitle>
              <AlertDialogDescription>Conservas tu avance, y puedes volver a inscribirte cuando quieras.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => ejecutar(`/api/v1/enrollments/${id}`, "DELETE", "Te retiraste del curso")}>
                Retirarme
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      className="w-full"
      disabled={trabajando}
      onClick={() =>
        retirado
          ? ejecutar(`/api/v1/enrollments/${id}/reenroll`, "POST", "Volviste a inscribirte")
          : ejecutar("/api/v1/enrollments", "POST", `Te inscribiste en «${titulo}»`, { course_id: id })
      }
    >
      {retirado ? "Volver a inscribirme" : "Inscribirme"}
    </Button>
  );
}

function Esqueleto() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-hidden="true">
      <Skeleton className="h-5 w-48" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function Curso() {
  const { id } = useParams();
  const [detalle, setDetalle] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<{ estado: number; mensaje: string } | null>(null);
  useTitle(detalle?.course.title);

  const cargar = useCallback(() => {
    setError(null);
    api<CourseDetail>(`/api/v1/courses/${id}`)
      .then(({ data }) => setDetalle(data))
      .catch((e) =>
        setError({
          estado: e instanceof ApiError ? e.status : 0,
          mensaje: e instanceof ApiError ? e.message : "No se pudo contactar la API",
        }),
      );
  }, [id]);

  useEffect(() => {
    setDetalle(null);
    cargar();
  }, [cargar]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {error.estado === 404 ? (
          <EmptyState
            icono={LayoutGrid}
            titulo="No encontramos este curso"
            accion={
              <Button asChild>
                <Link to="/">Volver al catálogo</Link>
              </Button>
            }
          >
            Puede que se haya despublicado o que el enlace esté mal escrito.
          </EmptyState>
        ) : (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>No se pudo cargar el curso</AlertTitle>
            <AlertDescription>
              {error.mensaje}
              <Button variant="outline" size="sm" className="mt-3" onClick={cargar}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
  if (!detalle) return <Esqueleto />;

  const { course } = detalle;
  const version = detalle.version ?? course.current_version;
  const modulos = [...(version?.modules ?? [])].sort((a, b) => a.position - b.position);
  const resumen = resumenCurso(version);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Catálogo</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[16rem] truncate">{course.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12">
        <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">{course.title}</h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            {course.description || "Este curso todavía no tiene descripción."}
          </p>
        </header>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-24">
            <CourseCover id={course.id} className="max-sm:aspect-[16/7]" />
            <div className="space-y-5 p-5">
              <Inscripcion id={course.id} titulo={course.title} />
              <ul className="space-y-2.5 border-t pt-5">
                <Dato icono={Layers}>{plural(resumen.modulos, "módulo", "módulos")}</Dato>
                <Dato icono={LayoutGrid}>{plural(resumen.unidades, "unidad", "unidades")}</Dato>
                {version?.min_required_pct != null && (
                  <Dato icono={Percent}>{version.min_required_pct}% mínimo para aprobar</Dato>
                )}
              </ul>
            </div>
          </div>
        </aside>

        <section className="lg:col-start-1 lg:row-start-2">
          <h2 className="mt-4 text-2xl font-bold">Contenido del curso</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plural(resumen.modulos, "módulo", "módulos")} · {plural(resumen.unidades, "unidad", "unidades")} ·{" "}
            {plural(resumen.recursos, "recurso", "recursos")}
          </p>

          {modulos.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
              Este curso todavía no tiene módulos.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={modulos.slice(0, 1).map((m) => String(m.id))}
              className="mt-5 overflow-hidden rounded-2xl border bg-card"
            >
              {modulos.map((m, i) => (
                <AccordionItem key={m.id} value={String(m.id)} className="px-5">
                  <AccordionTrigger className="py-4 text-base hover:no-underline">
                    <span className="flex flex-col items-start gap-0.5 text-left">
                      <span className="font-heading text-lg font-semibold">
                        {i + 1}. {m.title}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {plural((m.units ?? []).length, "unidad", "unidades")}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {m.description && <p className="mb-3 text-muted-foreground">{m.description}</p>}
                    <ul className="space-y-4 pb-2">
                      {[...(m.units ?? [])]
                        .sort((a, b) => a.position - b.position)
                        .map((u) => (
                          <li key={u.id}>
                            <p className="font-medium">{u.title}</p>
                            <ul className="mt-1.5 space-y-1">
                              {[...(u.resources ?? [])].map((r) => {
                                const { etiqueta, icono: Icono } = infoRecurso(r.type);
                                return (
                                  <li key={r.id} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                    <Icono className="size-4 shrink-0" />
                                    <span className="truncate">{r.title}</span>
                                    {etiqueta.toLowerCase() !== r.title.toLowerCase() && (
                                      <span className="ml-auto shrink-0 text-xs">{etiqueta}</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>
      </div>
    </div>
  );
}
