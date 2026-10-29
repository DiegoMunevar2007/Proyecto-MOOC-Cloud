import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, type Resource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { QuizPlayer } from "@/components/quiz-player";
import { MediaPlayer } from "@/components/media-player";
import {
  Notice,
  RemoteState,
  message,
  safeURL,
  send,
  useRemote,
} from "@/lib/workspace";
import { useTitle } from "@/lib/use-title";
function Content({ resource }: { resource: Resource }) {
  const [url, setURL] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState(false);
  const media = ["video", "audio"].includes(resource.type);
  const blocked =
    resource.object_key &&
    (resource.scan_status !== "clean" ||
      (media && (resource.processing_status !== "ready" || !resource.hls_key)));
  async function record() {
    try {
      await send("/api/v1/progress/heartbeat", "POST", {
        stable_id: resource.stable_id,
        event: resource.type === "pdf" ? "pdf_open" : "open",
      });
      setRecorded(true);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    if (resource.type === "quiz" || blocked) return;
    const abort = new AbortController();
    if (resource.type === "text") void record();
    else if (resource.external_url) {
      const next = safeURL(resource.external_url);
      if (next) setURL(next);
      else setError("El recurso tiene un enlace inválido.");
    } else
      api<{ url: string }>(`/api/v1/resources/${resource.id}/download-url`, {
        signal: abort.signal,
      })
        .then((r) => {
          const next = safeURL(r.data.url);
          if (!next) throw new Error("Enlace de contenido inválido");
          setURL(next);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(message(e));
        });
    return () => abort.abort();
  }, [resource.id]);
  if (resource.type === "quiz") return <QuizPlayer resourceId={resource.id} />;
  if (blocked)
    return (
      <Notice>
        Este archivo sigue en procesamiento o no superó la revisión. Todavía no
        está disponible.
      </Notice>
    );
  return (
    <div className="space-y-5">
      {error && <Notice>{error}</Notice>}
      {resource.type === "text" ? (
        <article className="max-w-prose whitespace-pre-wrap text-base leading-8">
          {resource.markdown_body}
        </article>
      ) : !url ? (
        <p role="status">Preparando contenido…</p>
      ) : media ? (
        <MediaPlayer
          url={url}
          stableId={resource.stable_id}
          audio={resource.type === "audio"}
        />
      ) : (
        <>
          <Button asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void record()}
            >
              Abrir {resource.type === "pdf" ? "documento PDF" : "contenido"} ↗
            </a>
          </Button>
          {resource.type === "image" && (
            <img
              src={url}
              alt={resource.title}
              onLoad={() => void record()}
              className="max-h-[70vh] rounded-xl object-contain"
            />
          )}
          <p className="text-sm text-muted-foreground">
            El contenido se abre en una pestaña nueva. Puedes regresar para
            continuar el curso.
          </p>
        </>
      )}
      {recorded && (
        <p role="status" className="text-sm text-success">
          Apertura registrada en tu progreso.
        </p>
      )}
    </div>
  );
}
export function Aprender() {
  const { id = "", resourceId = "" } = useParams();
  const { data, error, reload } = useRemote<{ resource: Resource }>(
    `/api/v1/resources/${resourceId}`,
  );
  useTitle(data?.resource.title ?? "Aprender");
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link to={`/cursos/${id}`} className="text-sm text-primary">
        ← Volver al curso y ver mi progreso
      </Link>
      {!data ? (
        <div className="mt-6">
          <RemoteState error={error} retry={reload} />
        </div>
      ) : (
        <>
          <h1 className="my-6 text-3xl font-bold">{data.resource.title}</h1>
          <Content key={data.resource.id} resource={data.resource} />
        </>
      )}
    </div>
  );
}
