import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icono: Icono,
  titulo,
  children,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icono className="size-6" />
      </span>
      <h2 className="text-xl font-semibold">{titulo}</h2>
      {children && <p className="mt-1.5 max-w-sm text-muted-foreground">{children}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}
