import { cn } from "@/lib/utils";

// Marca: tres barras que suben, la capacidad que crece con la demanda.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-brand" />
      <rect x="6.5" y="17" width="5" height="9" rx="2.5" className="fill-brand-foreground" />
      <rect x="13.5" y="12" width="5" height="14" rx="2.5" className="fill-brand-foreground" />
      <rect x="20.5" y="6" width="5" height="20" rx="2.5" className="fill-signal" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-xl font-bold tracking-tight">MOOC</span>
    </span>
  );
}
