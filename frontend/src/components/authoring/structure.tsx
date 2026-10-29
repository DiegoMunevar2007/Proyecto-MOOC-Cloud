import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Field, control, Notice, send, useAction } from "@/lib/workspace";
import type { Module, Resource, Unit } from "@/lib/api";
import { infoRecurso } from "@/components/recurso";

export function TitleForm({
  path,
  method = "POST",
  title = "",
  description = "",
  label,
  after,
}: {
  path: string;
  method?: string;
  title?: string;
  description?: string;
  label: string;
  after: () => void;
}) {
  const action = useAction();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    await action.run(async () => {
      await send(path, method, {
        title: values.get("title"),
        description: values.get("description"),
      });
      form.reset();
      after();
    }, "Cambios guardados");
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Título">
        <input name="title" defaultValue={title} required className={control} />
      </Field>
      <Field label="Descripción">
        <textarea
          name="description"
          defaultValue={description}
          rows={2}
          className={control}
        />
      </Field>
      {action.error && <Notice>{action.error}</Notice>}
      <Button type="submit" variant="outline" disabled={action.busy}>
        {action.busy ? "Guardando…" : label}
      </Button>
    </form>
  );
}
export function resourceStatus(r: Resource) {
  if (r.type === "quiz") return "Quiz";
  if (["text", "link", "iframe"].includes(r.type)) return "Contenido";
  if (!r.object_key) return "Sin archivo";
  if (r.scan_status === "infected") return "Archivo rechazado";
  if (r.processing_status === "failed") return "Procesamiento fallido";
  if (r.scan_status !== "clean") return "Escaneando";
  if (["video", "audio"].includes(r.type) && r.processing_status !== "ready")
    return "Procesando";
  return "Disponible";
}
function UnitEditor({
  unit,
  courseId,
  editable,
  reload,
}: {
  unit: Unit;
  courseId: string;
  editable: boolean;
  reload: () => void;
}) {
  const action = useAction();
  const [type, setType] = useState("text");
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    await action.run(async () => {
      await send(`/api/v1/units/${unit.id}/resources`, "POST", {
        type,
        title: values.get("title"),
        markdown_body: values.get("body") ?? "",
        external_url: values.get("url") ?? "",
        is_visible: true,
        is_required: true,
        allow_download: true,
      });
      form.reset();
      reload();
    }, "Recurso agregado");
  }
  return (
    <section className="mt-5 border-t pt-5">
      <h3 className="text-lg font-semibold">{unit.title}</h3>
      {editable && (
        <details className="my-3">
          <summary className="cursor-pointer text-sm text-primary">
            Editar unidad
          </summary>
          <div className="mt-3">
            <TitleForm
              path={`/api/v1/units/${unit.id}`}
              method="PUT"
              title={unit.title}
              description={unit.description}
              label="Guardar unidad"
              after={reload}
            />
          </div>
        </details>
      )}
      <ul className="my-3 divide-y">
        {(unit.resources ?? []).map((r) => (
          <li key={r.id}>
            <Link
              to={`/ensenar/${courseId}/recursos/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md py-3 text-sm hover:text-primary"
            >
              <span>
                {infoRecurso(r.type).etiqueta} · {r.title}
              </span>
              <span className="text-muted-foreground">
                {resourceStatus(r)} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {editable && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Agregar recurso
          </summary>
          <form onSubmit={add} className="mt-4 space-y-3">
            <Field label="Tipo de recurso">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={control}
              >
                {[
                  "text",
                  "video",
                  "audio",
                  "pdf",
                  "image",
                  "file",
                  "link",
                  "quiz",
                ].map((t) => (
                  <option key={t} value={t}>
                    {infoRecurso(t).etiqueta}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Título del recurso">
              <input name="title" required className={control} />
            </Field>
            {type === "text" && (
              <Field label="Contenido de la lectura">
                <textarea name="body" required rows={5} className={control} />
              </Field>
            )}
            {type === "link" && (
              <Field label="Dirección del enlace">
                <input
                  name="url"
                  type="url"
                  pattern="https?://.*"
                  required
                  className={control}
                />
              </Field>
            )}
            <p className="text-sm text-muted-foreground">
              Después de agregarlo podrás{" "}
              {type === "quiz"
                ? "configurar sus preguntas"
                : "editarlo y cargar su archivo"}
              .
            </p>
            {action.error && <Notice>{action.error}</Notice>}
            <Button disabled={action.busy} type="submit">
              Agregar recurso
            </Button>
          </form>
        </details>
      )}
    </section>
  );
}
export function ModuleEditor({
  module,
  courseId,
  editable,
  reload,
}: {
  module: Module;
  courseId: string;
  editable: boolean;
  reload: () => void;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">
        {module.position}. {module.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
      {editable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-primary">
            Editar módulo
          </summary>
          <div className="mt-3">
            <TitleForm
              path={`/api/v1/modules/${module.id}`}
              method="PUT"
              title={module.title}
              description={module.description}
              label="Guardar módulo"
              after={reload}
            />
          </div>
        </details>
      )}
      {(module.units ?? []).map((u) => (
        <UnitEditor
          key={u.id}
          unit={u}
          courseId={courseId}
          editable={editable}
          reload={reload}
        />
      ))}
      {editable && (
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer font-medium text-primary">
            Agregar unidad
          </summary>
          <div className="mt-3">
            <TitleForm
              path={`/api/v1/modules/${module.id}/units`}
              label="Agregar unidad"
              after={reload}
            />
          </div>
        </details>
      )}
    </section>
  );
}
