import { Link } from "react-router";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCover } from "@/components/course-cover";
import { plural, resumenCurso } from "@/lib/cursos";
import type { Course } from "@/lib/api";

export function CourseCard({ curso, inscrito }: { curso: Course; inscrito: boolean }) {
  const version = curso.current_version;
  const { modulos, unidades } = resumenCurso(version);
  return (
    <Link
      to={`/cursos/${curso.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card outline-none transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative overflow-hidden">
        <CourseCover id={curso.id} className="transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
        {inscrito && (
          <Badge className="absolute top-3 left-3 h-6 gap-1 bg-background text-foreground shadow-sm">
            <Check className="text-success" /> Inscrito
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-xl leading-snug font-semibold">{curso.title}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {curso.description || "Este curso todavía no tiene descripción."}
        </p>
        {version?.modules && (
          <p className="mt-auto pt-3 text-sm text-muted-foreground">
            {plural(modulos, "módulo", "módulos")} · {plural(unidades, "unidad", "unidades")}
          </p>
        )}
      </div>
    </Link>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card" aria-hidden="true">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-2.5 p-5">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
