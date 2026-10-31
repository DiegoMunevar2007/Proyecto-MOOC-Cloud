import { useEffect, useRef, useState } from "react";
import { Activity, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { plural } from "@/lib/cursos";
import { useTitle } from "@/lib/use-title";

interface Muestra {
  ok: boolean;
  instancia: string | null;
  ms: number;
}

const PETICIONES = 24;
const COLORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

async function consultar(): Promise<Muestra> {
  const inicio = performance.now();
  try {
    const { servedBy } = await api<{ status: string }>("/health", { cache: "no-store" });
    return { ok: true, instancia: servedBy, ms: performance.now() - inicio };
  } catch {
    return { ok: false, instancia: null, ms: performance.now() - inicio };
  }
}

export function Estado() {
  useTitle("Estado");
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const vivo = useRef(true);

  async function probar(n: number) {
    setCorriendo(true);
    setMuestras([]);
    const acumuladas: Muestra[] = [];
    for (let i = 0; i < n && vivo.current; i++) {
      acumuladas.push(await consultar());
      setMuestras([...acumuladas]);
    }
    if (vivo.current) setCorriendo(false);
  }

  useEffect(() => {
    vivo.current = true;
    void probar(1);
    return () => {
      vivo.current = false;
    };
  }, []);

  // El color de cada instancia es el orden en que apareció, no su nombre: así
  // no cambia entre recargas del mismo reparto.
  const orden: string[] = [];
  for (const m of muestras) if (m.instancia && !orden.includes(m.instancia)) orden.push(m.instancia);
  const conteo = new Map(orden.map((i) => [i, muestras.filter((m) => m.instancia === i).length]));
  const color = (i: string | null) => (i ? COLORES[orden.indexOf(i) % COLORES.length] : "var(--destructive)");

  const total = muestras.length;
  const fallas = muestras.filter((m) => !m.ok).length;
  const promedio = total ? muestras.reduce((s, m) => s + m.ms, 0) / total : 0;
  const operativo = total > 0 && fallas === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Estado de la plataforma</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Cada respuesta dice qué instancia de la API la atendió. Con varias instancias, el balanceador reparte las peticiones entre ellas.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Servicio</p>
          <p className="mt-2 flex items-center gap-2.5 text-2xl font-semibold">
            <span
              className={`size-3 rounded-full ${total === 0 ? "bg-muted-foreground/40" : operativo ? "bg-success" : "bg-destructive"}`}
              aria-hidden="true"
            />
            {total === 0 ? "Comprobando…" : operativo ? "Operativo" : "Con fallas"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Base de datos y cola de trabajos</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Instancias de la API</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{orden.length || "—"}</p>
          <p className="mt-1 text-sm text-muted-foreground">que respondieron</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Latencia media</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{total ? `${promedio.toFixed(0)} ms` : "—"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{total ? plural(total, "petición", "peticiones") : "sin datos"}</p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="titulo-balanceo">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="titulo-balanceo" className="text-xl font-bold">
              Prueba de balanceo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Envía {PETICIONES} peticiones seguidas y mira dónde cae cada una.</p>
          </div>
          <Button onClick={() => probar(PETICIONES)} disabled={corriendo}>
            {corriendo ? <Loader2 className="animate-spin" /> : <Play />}
            {corriendo ? `Enviando ${total} de ${PETICIONES}` : `Enviar ${PETICIONES} peticiones`}
          </Button>
        </div>

        <div
          role="img"
          aria-label={
            total > 1 ? `Reparto de ${total} peticiones entre ${plural(orden.length, "instancia", "instancias")}` : "Todavía no hay una prueba de balanceo"
          }
          className="mt-6 grid grid-cols-12 gap-1.5 sm:gap-2"
        >
          {Array.from({ length: Math.max(PETICIONES, total) }, (_, i) => {
            const m = muestras[i];
            return (
              <span
                key={i}
                title={m ? (m.instancia ?? "Sin respuesta") : undefined}
                className="aspect-square rounded-md transition-colors duration-200"
                style={{ background: m ? color(m.instancia) : "var(--muted)" }}
              />
            );
          })}
        </div>

        {orden.length > 0 && total > 1 && (
          <ul className="mt-6 space-y-3">
            {orden.map((instancia) => {
              const n = conteo.get(instancia) ?? 0;
              return (
                <li key={instancia} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[auto_minmax(9rem,14rem)_1fr_auto]">
                  <span className="size-3 rounded-sm" style={{ background: color(instancia) }} aria-hidden="true" />
                  <span className="truncate font-mono text-[0.8rem]">{instancia}</span>
                  <span className="hidden h-2 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                    <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${(n / total) * 100}%`, background: color(instancia) }} />
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {n} · {Math.round((n / total) * 100)}%
                  </span>
                </li>
              );
            })}
            {fallas > 0 && (
              <li className="flex items-center gap-3 text-sm text-destructive">
                <span className="size-3 rounded-sm bg-destructive" aria-hidden="true" />
                {plural(fallas, "petición sin respuesta", "peticiones sin respuesta")}
              </li>
            )}
          </ul>
        )}

        {total === 1 && !corriendo && (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4" /> Respondió {muestras[0].instancia ?? "la API"}. Envía la prueba para ver el reparto.
          </p>
        )}
      </section>
    </div>
  );
}
