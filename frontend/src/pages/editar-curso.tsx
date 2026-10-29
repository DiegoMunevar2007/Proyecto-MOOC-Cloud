import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleEditor, TitleForm } from "@/components/authoring/structure";
import {
  Notice,
  RemoteState,
  send,
  useAction,
  useRemote,
} from "@/lib/workspace";
import type { CourseDetail } from "@/lib/api";
import { courseStatus } from "./ensenar";
import { useTitle } from "@/lib/use-title";

export function EditarCurso() {
  const { id = "" } = useParams();
  const { data, error, reload } = useRemote<CourseDetail>(
    `/api/v1/courses/${id}`,
  );
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);
  const action = useAction();
  useTitle(data?.course.title ?? "Editar curso");
  const refresh = () => {
    setValidation(null);
    reload();
  };
  if (!data)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <RemoteState error={error} retry={reload} />
      </div>
    );
  const editable =
    data.course.status !== "published" && data.version?.status === "draft";
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link className="text-sm text-primary" to="/ensenar">
        ← Mis cursos de autoría
      </Link>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="break-words text-3xl font-bold">{data.course.title}</h1>
        <Badge variant="secondary">{courseStatus[data.course.status]}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        {editable
          ? "Organiza las lecciones y comprueba que cada recurso esté disponible antes de publicar."
          : "El curso publicado conserva su contenido. Los estudiantes ya pueden encontrarlo en el catálogo."}
      </p>
      {action.error && (
        <div className="mt-4">
          <Notice>{action.error}</Notice>
        </div>
      )}
      <div className="my-6 flex flex-wrap gap-3">
        {editable ? (
          <>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  const r = await send<{ valid: boolean; errors: string[] }>(
                    `/api/v1/courses/${id}/validate`,
                    "GET",
                  );
                  setValidation(r.data);
                })
              }
            >
              Revisar publicación
            </Button>
            <Button
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await send(`/api/v1/courses/${id}/publish`, "POST");
                  refresh();
                }, "Curso publicado: ya aparece en el catálogo")
              }
            >
              Publicar curso
            </Button>
          </>
        ) : (
          <Button asChild>
            <Link to={`/cursos/${id}`}>Ver curso publicado</Link>
          </Button>
        )}
        <Button variant="ghost" onClick={reload}>
          Actualizar estados
        </Button>
      </div>
      {validation && (
        <div className="mb-6 rounded-xl border p-4" role="status">
          {validation.valid ? (
            "Todo listo para publicar."
          ) : (
            <>
              <p className="font-medium">Antes de publicar:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {editable && (
        <details className="mb-6 rounded-xl border p-5">
          <summary className="cursor-pointer font-semibold">
            Datos del curso
          </summary>
          <div className="mt-4">
            <TitleForm
              path={`/api/v1/courses/${id}`}
              method="PUT"
              title={data.course.title}
              description={data.course.description}
              label="Guardar curso"
              after={refresh}
            />
          </div>
        </details>
      )}
      <div className="space-y-5">
        {(data.version?.modules ?? []).map((m) => (
          <ModuleEditor
            key={m.id}
            module={m}
            courseId={id}
            editable={editable}
            reload={refresh}
          />
        ))}
      </div>
      {editable && (
        <details
          className="mt-6 rounded-xl border border-dashed p-5"
          open={!data.version?.modules?.length}
        >
          <summary className="cursor-pointer font-semibold text-primary">
            Agregar módulo
          </summary>
          <div className="mt-4">
            <TitleForm
              path={`/api/v1/courses/${id}/modules`}
              label="Agregar módulo"
              after={refresh}
            />
          </div>
        </details>
      )}
    </div>
  );
}
