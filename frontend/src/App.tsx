import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/app-shell";
import { Catalogo } from "@/pages/catalogo";
import { Curso } from "@/pages/curso";
import { Estado } from "@/pages/estado";
import { Ingresar } from "@/pages/ingresar";
import { MisCursos } from "@/pages/mis-cursos";
import { NoEncontrado } from "@/pages/no-encontrado";
import { useAuth } from "@/lib/auth";

// Al cambiar de página se vuelve arriba, como en una carga normal.
function VolverArriba() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function SoloEstudiantes({ children }: { children: ReactNode }) {
  const { me, cargando } = useAuth();
  if (cargando) return null;
  if (!me) return <Navigate to={`/ingresar?volver=${encodeURIComponent("/mis-cursos")}`} replace />;
  if (me.role !== "student") return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <>
      <VolverArriba />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Catalogo />} />
          <Route path="cursos/:id" element={<Curso />} />
          <Route
            path="mis-cursos"
            element={
              <SoloEstudiantes>
                <MisCursos />
              </SoloEstudiantes>
            }
          />
          <Route path="ingresar" element={<Ingresar />} />
          <Route path="estado" element={<Estado />} />
          <Route path="*" element={<NoEncontrado />} />
        </Route>
      </Routes>
    </>
  );
}
