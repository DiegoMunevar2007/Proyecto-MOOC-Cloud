import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/app-shell";
import { Catalogo } from "@/pages/catalogo";
import { Curso } from "@/pages/curso";
import { Estado } from "@/pages/estado";
import { Ingresar } from "@/pages/ingresar";
import { MisCursos } from "@/pages/mis-cursos";
import { NoEncontrado } from "@/pages/no-encontrado";
import { Ensenar } from "@/pages/ensenar";
import { EditarCurso } from "@/pages/editar-curso";
import { EditarRecurso } from "@/pages/editar-recurso";
const Aprender = lazy(() => import("@/pages/aprender").then((m) => ({ default: m.Aprender })));
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
  const location = useLocation();
  if (cargando) return null;
  if (!me) return <Navigate to={`/ingresar?volver=${encodeURIComponent(location.pathname)}`} replace />;
  if (me.role !== "student") return <Navigate to="/" replace />;
  return children;
}

function SoloAutores({ children }: { children: ReactNode }) {
  const { me, cargando } = useAuth(); const location = useLocation();
  if (cargando) return <p role="status">Cargando sesión…</p>;
  if (!me) return <Navigate to={`/ingresar?volver=${encodeURIComponent(location.pathname)}`} replace />;
  if (!["professor", "admin"].includes(me.role)) return <Navigate to="/" replace />;
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
          <Route path="ensenar" element={<SoloAutores><Ensenar /></SoloAutores>} />
          <Route path="ensenar/:id" element={<SoloAutores><EditarCurso /></SoloAutores>} />
          <Route path="ensenar/:id/recursos/:resourceId" element={<SoloAutores><EditarRecurso /></SoloAutores>} />
          <Route path="cursos/:id/recursos/:resourceId" element={<SoloEstudiantes><Suspense fallback={<p role="status" className="p-6">Cargando contenido…</p>}><Aprender /></Suspense></SoloEstudiantes>} />
          <Route path="*" element={<NoEncontrado />} />
        </Route>
      </Routes>
    </>
  );
}
