import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  control,
  Notice,
  RemoteState,
  send,
  useAction,
  useRemote,
} from "@/lib/workspace";
import type { CourseDetail, CoursesResponse } from "@/lib/api";
import { useTitle } from "@/lib/use-title";

export const courseStatus: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  unpublished: "Sin publicar",
};
export function Ensenar() {
  useTitle("Mis cursos de autoría");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useRemote<CoursesResponse>(
    `/api/v1/courses/mine?page=${page}`,
  );
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const navigate = useNavigate();
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await action.run(async () => {
      const { data } = await send<CourseDetail>("/api/v1/courses", "POST", {
        title: values.get("title"),
        description: values.get("description"),
        slug: `${String(values.get("title"))
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 8)}`,
        min_required_pct: Number(values.get("minimum")),
      });
      await navigate(`/ensenar/${data.course.id}`);
    }, "Borrador creado");
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Tu espacio de enseñanza</h1>
          <p className="mt-2 text-muted-foreground">
            Prepara el contenido, revisa los recursos y publica cuando esté
            listo.
          </p>
        </div>
        <Button onClick={() => setCreating(!creating)}>
          <Plus /> Crear curso
        </Button>
      </div>
      {creating && (
        <form
          onSubmit={create}
          className="mt-8 space-y-4 rounded-xl border bg-card p-5"
        >
          <h2 className="text-xl font-semibold">Un nuevo curso</h2>
          <Field label="Título">
            <input name="title" required maxLength={180} className={control} />
          </Field>
          <Field label="Descripción">
            <textarea
              name="description"
              required
              rows={3}
              className={control}
            />
          </Field>
          <Field label="Nota mínima de aprobación (%)">
            <input
              name="minimum"
              type="number"
              min={1}
              max={100}
              defaultValue={80}
              required
              className={control}
            />
          </Field>
          {action.error && <Notice>{action.error}</Notice>}
          <Button disabled={action.busy} type="submit">
            {action.busy ? "Creando…" : "Crear borrador"}
          </Button>
        </form>
      )}
      <div className="mt-8">
        {!data ? (
          <RemoteState error={error} retry={reload} />
        ) : data.courses.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <BookOpen className="mx-auto mb-3 size-8 text-primary" />
            <h2 className="text-xl font-semibold">
              Tu primer curso empieza aquí
            </h2>
            <p className="mt-2 text-muted-foreground">
              Crea un borrador y organiza tus lecciones antes de publicarlo.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {data.courses.map((c) => (
              <li key={c.id}>
                <Link
                  className="flex items-center gap-4 p-5 transition-colors hover:bg-muted focus-visible:outline-ring"
                  to={`/ensenar/${c.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold">
                      {c.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {courseStatus[c.status] ?? c.status}
                  </Badge>
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && data.total > data.limit && (
        <nav aria-label="Paginación" className="mt-5 flex items-center gap-4">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span>Página {page}</span>
          <Button
            variant="outline"
            disabled={page * data.limit >= data.total}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}
