import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { api } from "@/lib/api";
import { Notice, send, message } from "@/lib/workspace";
export function MediaPlayer({
  url,
  stableId,
  audio,
}: {
  url: string;
  stableId: string;
  audio: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const last = useRef(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const abort = new AbortController();
    let hls: Hls | undefined;
    if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = url;
    else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal)
          setError(
            "No se pudo reproducir el contenido. Vuelve a abrir el recurso para reintentar.",
          );
      });
    } else setError("Este navegador no admite reproducción HLS.");
    const position = api<{ position_sec: number }>(
      `/api/v1/progress/position/${stableId}`,
      { signal: abort.signal },
    )
      .then((r) => r.data.position_sec)
      .catch(() => 0);
    const resume = () => {
      void position.then((seconds) => {
        if (
          !abort.signal.aborted &&
          Number.isFinite(video.duration) &&
          seconds < video.duration * 0.9
        )
          video.currentTime = seconds;
      });
    };
    video.addEventListener("loadedmetadata", resume, { once: true });
    return () => {
      abort.abort();
      video.removeEventListener("loadedmetadata", resume);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [url, stableId]);
  async function report(force = false) {
    const video = ref.current;
    if (
      !video ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      (!force && (video.paused || Date.now() - last.current < 10000))
    )
      return;
    last.current = Date.now();
    try {
      await send("/api/v1/progress/heartbeat", "POST", {
        stable_id: stableId,
        event: "playing",
        position_sec: Math.floor(video.currentTime),
        duration_sec: Math.ceil(video.duration),
      });
      setSaved(true);
    } catch (e) {
      setError(`No se guardó el progreso: ${message(e)}`);
    }
  }
  return (
    <div className="space-y-3">
      <video
        ref={ref}
        controls
        playsInline
        aria-label={audio ? "Reproductor de audio" : "Reproductor de video"}
        className={`w-full rounded-xl bg-black ${audio ? "h-24" : "aspect-video"}`}
        onTimeUpdate={() => void report()}
        onPause={() => void report(true)}
        onEnded={() => void report(true)}
        onError={() => setError("No se pudo cargar el archivo multimedia.")}
      />
      {error && <Notice>{error}</Notice>}
      <p role="status" className="text-sm text-muted-foreground">
        {saved
          ? "Progreso guardado. Se actualiza mientras reproduces el contenido."
          : "El avance se registra durante la reproducción."}
      </p>
    </div>
  );
}
