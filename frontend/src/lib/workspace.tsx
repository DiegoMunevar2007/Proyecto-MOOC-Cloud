import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";
export const send = <T,>(path: string, method: string, body?: unknown) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const control =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
    >
      {children}
    </div>
  );
}
export function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError("");
    api<T>(path, { signal: abort.signal })
      .then((r) => setData(r.data))
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      });
    return () => abort.abort();
  }, [path, revision]);
  return { data, error, reload };
}
export function RemoteState({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return error ? (
    <Notice>
      {error}
      <Button variant="outline" className="ml-3" onClick={retry}>
        Reintentar
      </Button>
    </Notice>
  ) : (
    <div aria-label="Cargando" className="space-y-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>, success?: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      if (success) toast.success(success);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function safeURL(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
