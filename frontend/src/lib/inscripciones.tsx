import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Enrollment } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Estado {
  /** null mientras carga, o si no hay sesión de estudiante. */
  lista: Enrollment[] | null;
  /** Cursos en los que el estudiante está inscrito ahora. */
  activos: Set<number>;
  refrescar: () => Promise<void>;
}

const Contexto = createContext<Estado | null>(null);

// Las inscripciones se piden una vez por sesión y se comparten: el catálogo las
// usa para marcar los cursos, y el detalle para decidir qué botón mostrar.
export function InscripcionesProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [lista, setLista] = useState<Enrollment[] | null>(null);
  const esEstudiante = me?.role === "student";

  const refrescar = useCallback(async () => {
    if (!esEstudiante) {
      setLista(null);
      return;
    }
    try {
      const { data } = await api<{ enrollments: Enrollment[] }>("/api/v1/enrollments");
      setLista(data.enrollments ?? []);
    } catch {
      setLista([]);
    }
  }, [esEstudiante]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const valor = useMemo(
    () => ({
      lista,
      activos: new Set((lista ?? []).filter((i) => i.inscrito).map((i) => i.course_id)),
      refrescar,
    }),
    [lista, refrescar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useInscripciones() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useInscripciones fuera de InscripcionesProvider");
  return ctx;
}
