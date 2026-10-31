import { cn } from "@/lib/utils";

const BARRAS = [
  { alto: 26, signal: false },
  { alto: 42, signal: false },
  { alto: 34, signal: false },
  { alto: 58, signal: false },
  { alto: 50, signal: false },
  { alto: 76, signal: false },
  { alto: 100, signal: true },
];

// Las barras del logo a gran tamaño. Decorativas: suben una vez al cargar.
export function BarrasMarca({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none items-end gap-3.5 opacity-90", className)}>
      {BARRAS.map((b, i) => (
        <div
          key={i}
          className={cn("barra-sube w-14 rounded-t-full", b.signal ? "bg-signal" : "bg-brand-foreground/12")}
          style={{ height: `${b.alto}%`, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
