import { useState } from "react";
import { api, ApiError } from "./api";

interface Muestra {
  ok: boolean;
  servedBy: string;
  ms: number;
}

// Estado de la plataforma y reparto del balanceador. Cada respuesta de la API
// trae X-Served-By con la instancia del grupo que la atendió: con varias
// réplicas, repetir /health muestra cómo reparte el balanceador.
export function Estado() {
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function probar(n: number) {
    setCorriendo(true);
    setError(null);
    const nuevas: Muestra[] = [];
    for (let i = 0; i < n; i++) {
      const inicio = performance.now();
      try {
        const { servedBy } = await api<{ status: string }>("/health", { cache: "no-store" });
        nuevas.push({ ok: true, servedBy: servedBy ?? "?", ms: performance.now() - inicio });
      } catch (e) {
        nuevas.push({ ok: false, servedBy: "—", ms: performance.now() - inicio });
        setError(e instanceof ApiError ? e.message : "No se pudo contactar la API");
      }
      setMuestras([...nuevas]);
    }
    setCorriendo(false);
  }

  const reparto = new Map<string, number>();
  for (const m of muestras) reparto.set(m.servedBy, (reparto.get(m.servedBy) ?? 0) + 1);
  const ok = muestras.filter((m) => m.ok).length;
  const promedio = muestras.length ? muestras.reduce((s, m) => s + m.ms, 0) / muestras.length : 0;
  const ultima = muestras.at(-1);

  return (
    <section>
      <h1>Estado de la plataforma</h1>
      <p className="ayuda">
        <code>/health</code> verifica PostgreSQL y Redis. La cabecera <code>X-Served-By</code> dice
        qué instancia de la API respondió.
      </p>

      <div className="acciones">
        <button disabled={corriendo} onClick={() => probar(1)}>
          Consultar /health
        </button>
        <button disabled={corriendo} onClick={() => probar(20)}>
          Probar balanceo (20 peticiones)
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {ultima && (
        <div className="tarjetas">
          <div className="tarjeta">
            <div className="etiqueta">Última respuesta</div>
            <div className={ultima.ok ? "valor ok" : "valor mal"}>{ultima.ok ? "OK" : "Error"}</div>
          </div>
          <div className="tarjeta">
            <div className="etiqueta">Exitosas</div>
            <div className="valor">
              {ok}/{muestras.length}
            </div>
          </div>
          <div className="tarjeta">
            <div className="etiqueta">Latencia promedio</div>
            <div className="valor">{promedio.toFixed(0)} ms</div>
          </div>
        </div>
      )}

      {reparto.size > 0 && (
        <>
          <h2>Reparto entre instancias</h2>
          <ul className="reparto">
            {[...reparto.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([instancia, n]) => (
                <li key={instancia}>
                  <span className="instancia">{instancia}</span>
                  <span className="barra">
                    <span style={{ width: `${(n / muestras.length) * 100}%` }} />
                  </span>
                  <span className="cuenta">{n}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
