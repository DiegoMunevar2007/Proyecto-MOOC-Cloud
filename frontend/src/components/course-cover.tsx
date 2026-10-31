import { cn } from "@/lib/utils";

// Cada curso tiene una portada propia generada a partir de su id: el mismo
// curso se ve igual en el catálogo, en el detalle y en "Mis cursos", sin
// depender de que el profesor suba una imagen.

interface Paleta {
  fondo: string;
  a: string;
  b: string;
}

const PALETAS: Paleta[] = [
  { fondo: "oklch(0.44 0.22 265)", a: "oklch(0.89 0.17 95)", b: "oklch(0.97 0.02 265)" },
  { fondo: "oklch(0.89 0.17 95)", a: "oklch(0.34 0.16 265)", b: "oklch(0.66 0.2 15)" },
  { fondo: "oklch(0.66 0.2 15)", a: "oklch(0.97 0.02 20)", b: "oklch(0.3 0.13 265)" },
  { fondo: "oklch(0.74 0.12 190)", a: "oklch(0.27 0.08 265)", b: "oklch(0.97 0.02 190)" },
  { fondo: "oklch(0.56 0.2 305)", a: "oklch(0.89 0.17 95)", b: "oklch(0.97 0.02 305)" },
];

// PRNG determinista (mulberry32): mismo id, misma portada.
function semilla(id: number) {
  let t = (id * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function Barras({ p, rnd }: { p: Paleta; rnd: () => number }) {
  const n = 6;
  const ancho = 160 / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const alto = 22 + rnd() * 62;
        return (
          <rect
            key={i}
            x={i * ancho + 3}
            y={100 - alto}
            width={ancho - 6}
            height={alto}
            rx={(ancho - 6) / 2}
            fill={i % 3 === 0 ? p.b : p.a}
            opacity={i % 3 === 1 ? 0.55 : 1}
          />
        );
      })}
    </>
  );
}

function Arcos({ p, rnd }: { p: Paleta; rnd: () => number }) {
  const esquinaDerecha = rnd() > 0.5;
  const cx = esquinaDerecha ? 160 : 0;
  return (
    <>
      {[84, 66, 48, 30, 14].map((r, i) => (
        <circle key={r} cx={cx} cy={100} r={r} fill={i % 2 === 0 ? p.a : p.b} opacity={i === 1 ? 0.6 : 1} />
      ))}
    </>
  );
}

function Puntos({ p, rnd }: { p: Paleta; rnd: () => number }) {
  const fx = 30 + rnd() * 100;
  const fy = 20 + rnd() * 60;
  const celdas: { x: number; y: number; r: number }[] = [];
  for (let y = 10; y < 100; y += 16) {
    for (let x = 10; x < 160; x += 16) {
      const d = Math.hypot(x - fx, y - fy);
      celdas.push({ x, y, r: Math.max(1.2, 7.5 - d / 14) });
    }
  }
  return (
    <>
      {celdas.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.r > 4 ? p.a : p.b} />
      ))}
    </>
  );
}

function Bloques({ p, rnd }: { p: Paleta; rnd: () => number }) {
  const giro = rnd() > 0.5;
  return (
    <>
      <circle cx={giro ? 52 : 108} cy={52} r={34} fill={p.a} />
      <rect x={giro ? 88 : 12} y={44} width={60} height={46} rx={4} fill={p.b} />
      <path d={giro ? "M12 100 A34 34 0 0 1 80 100 Z" : "M80 100 A34 34 0 0 1 148 100 Z"} fill={p.a} opacity={0.75} />
    </>
  );
}

const DIBUJOS = [Barras, Arcos, Puntos, Bloques];

export function CourseCover({ id, className }: { id: number; className?: string }) {
  const rnd = semilla(id);
  const paleta = PALETAS[Math.floor(rnd() * PALETAS.length)];
  const Dibujo = DIBUJOS[Math.floor(rnd() * DIBUJOS.length)];
  return (
    <svg
      viewBox="0 0 160 100"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
      className={cn("block aspect-[16/10] w-full", className)}
      style={{ background: paleta.fondo }}
    >
      <Dibujo p={paleta} rnd={rnd} />
    </svg>
  );
}
