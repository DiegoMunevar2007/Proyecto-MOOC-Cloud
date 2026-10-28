import type { Course, CourseVersion } from "@/lib/api";

export function resumenCurso(version?: CourseVersion) {
  const modulos = version?.modules ?? [];
  const unidades = modulos.flatMap((m) => m.units ?? []);
  const recursos = unidades.flatMap((u) => u.resources ?? []);
  return { modulos: modulos.length, unidades: unidades.length, recursos: recursos.length };
}

export function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function versionDe(curso: Course, version?: CourseVersion) {
  return version ?? curso.current_version;
}

// Matricula.Status (backend/progress/progressmodels.go).
export const ESTADOS: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completado",
  approved: "Aprobado",
};
