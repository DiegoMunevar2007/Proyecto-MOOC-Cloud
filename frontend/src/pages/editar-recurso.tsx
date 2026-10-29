import { useState, useEffect, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api, type CourseDetail, type Resource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuizEditor } from "@/components/authoring/quiz-editor";
import { resourceStatus } from "@/components/authoring/structure";
import {
  Field,
  control,
  Notice,
  RemoteState,
  send,
  useAction,
  useRemote,
} from "@/lib/workspace";
import { useTitle } from "@/lib/use-title";

function Upload({
  resource,
  after,
}: {
  resource: Resource;
  after: () => void;
}) {
  const action = useAction();
  const [phase, setPhase] = useState("");
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file") as File;
    if (!file?.size) return;
    await action.run(async () => {
      setPhase("Autorizando carga…");
      const objectKey = `uploads/${resource.stable_id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { data } = await send<{ upload_url: string }>(
        `/api/v1/resources/${resource.id}/upload-url`,
        "POST",
        {
          object_key: objectKey,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        },
      );
      setPhase("Subiendo archivo… Mantén esta página abierta.");
      const response = await fetch(data.upload_url, {
        method: "PUT",
        body: file,
      });
      if (!response.ok)
        throw new Error(
          `La transferencia falló (${response.status}). Selecciona el archivo para reintentar.`,
        );
      setPhase("Archivo recibido. Se está verificando y procesando.");
      after();
    }, "Archivo enviado a procesamiento");
  }
  return (
    <form onSubmit={upload} className="space-y-3">
      <Field label="Archivo">
        <input
          name="file"
          type="file"
          required
          className={control}
          disabled={action.busy}
          accept={
            resource.type === "video"
              ? "video/*"
              : resource.type === "audio"
                ? "audio/*"
                : resource.type === "pdf"
                  ? "application/pdf"
                  : undefined
          }
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        La revisión antimalware y la conversión multimedia pueden tardar unos
        minutos.
      </p>
      {phase && !action.error && (
        <p role="status" className="text-sm">
          {phase}
        </p>
      )}
      {action.error && <Notice>{action.error}</Notice>}
      <Button disabled={action.busy} type="submit">
        {action.busy ? "Subiendo…" : "Subir archivo"}
      </Button>
    </form>
  );
}
function ResourceForm({
  resource,
  after,
}: {
  resource: Resource;
  after: () => void;
}) {
  const action = useAction();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await action.run(async () => {
      await send(`/api/v1/resources/${resource.id}`, "PUT", {
        title: values.get("title"),
        markdown_body: values.get("body") ?? "",
        external_url: values.get("url") ?? "",
        is_visible: values.has("visible"),
        is_required: values.has("required"),
        allow_download: resource.allow_download,
      });
      after();
    }, "Recurso guardado");
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Título">
        <input
          name="title"
          defaultValue={resource.title}
          required
          className={control}
        />
      </Field>
      {resource.type === "text" && (
        <Field label="Contenido">
          <textarea
            name="body"
            defaultValue={resource.markdown_body}
            required
            rows={8}
            className={control}
          />
        </Field>
      )}
      {["link", "iframe"].includes(resource.type) && (
        <Field label="Enlace">
          <input
            name="url"
            type="url"
            pattern="https?://.*"
            defaultValue={resource.external_url}
            required
            className={control}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            name="visible"
            type="checkbox"
            defaultChecked={resource.is_visible}
          />{" "}
          Visible para estudiantes
        </label>
        <label className="flex items-center gap-2">
          <input
            name="required"
            type="checkbox"
            defaultChecked={resource.is_required}
          />{" "}
          Obligatorio
        </label>
      </div>
      {action.error && <Notice>{action.error}</Notice>}
      <Button disabled={action.busy}>Guardar recurso</Button>
    </form>
  );
}
function ProcessingStatus({ resource }: { resource: Resource }) {
  const [current, setCurrent] = useState(resource);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setInterval(() => {
      api<{ resource: Resource }>(`/api/v1/resources/${resource.id}`, {
        signal: abort.signal,
      })
        .then((r) => {
          setCurrent(r.data.resource);
          setFailed(false);
        })
        .catch(() => {
          if (!abort.signal.aborted) setFailed(true);
        });
    }, 5000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [resource.id]);
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
      <Badge variant="secondary">{resourceStatus(current)}</Badge>
      {failed
        ? "No se pudo actualizar el estado; reintentando…"
        : "El estado se actualiza cada 5 segundos."}
    </div>
  );
}
export function EditarRecurso() {
  const { id = "", resourceId = "" } = useParams();
  const course = useRemote<CourseDetail>(`/api/v1/courses/${id}`);
  const remote = useRemote<{ resource: Resource }>(
    `/api/v1/resources/${resourceId}`,
  );
  useTitle(remote.data?.resource.title ?? "Editar recurso");
  if (!course.data || !remote.data)
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RemoteState
          error={course.error || remote.error}
          retry={() => {
            course.reload();
            remote.reload();
          }}
        />
      </div>
    );
  const resource = remote.data.resource;
  const belongs = course.data.version?.modules?.some((m) =>
    m.units?.some((u) => u.resources?.some((r) => r.id === resource.id)),
  );
  if (!belongs) return <Notice>El recurso no pertenece a este curso.</Notice>;
  const editable =
    course.data.course.status !== "published" &&
    course.data.version?.status === "draft";
  const file = !["text", "link", "iframe", "quiz"].includes(resource.type);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link to={`/ensenar/${id}`} className="text-sm text-primary">
        ← Volver al editor del curso
      </Link>
      <h1 className="mt-5 text-3xl font-bold">{resource.title}</h1>
      <div className="mt-5">
        <ProcessingStatus key={resource.object_key} resource={resource} />
      </div>
      <div className="mt-6 space-y-8">
        {editable ? (
          <section className="rounded-xl border bg-card p-5">
            <ResourceForm resource={resource} after={remote.reload} />
          </section>
        ) : (
          <p>El contenido publicado es inmutable.</p>
        )}
        {file && editable && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-xl font-semibold">Archivo del recurso</h2>
            {resource.object_key ? (
              <p className="text-sm text-muted-foreground">
                Este recurso ya tiene una carga asociada. Para usar otro
                archivo, agrega un recurso nuevo; así se conserva el estado de
                procesamiento del original.
              </p>
            ) : (
              <Upload resource={resource} after={remote.reload} />
            )}
          </section>
        )}
        {resource.type === "quiz" && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-xl font-semibold">
              Preguntas y evaluación
            </h2>
            <QuizEditor resourceId={resource.id} editable={editable} />
          </section>
        )}
      </div>
    </div>
  );
}
