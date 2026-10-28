import { useCallback, useEffect, useState } from "react";
import { api, setToken, getToken, type Me } from "./api";
import { Estado } from "./Estado";
import { Sesion } from "./Sesion";
import { Catalogo } from "./Catalogo";
import { MisCursos } from "./MisCursos";

type Vista = "catalogo" | "mis-cursos" | "estado" | "sesion";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [vista, setVista] = useState<Vista>("catalogo");

  const cargarSesion = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      return;
    }
    try {
      const { data } = await api<Me>("/api/v1/auth/me");
      setMe(data);
    } catch {
      // Token vencido o revocado: se descarta.
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void cargarSesion();
  }, [cargarSesion]);

  async function salir() {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Aunque falle, la sesión local se cierra.
    }
    setToken(null);
    setMe(null);
    setVista("catalogo");
  }

  const pestañas: { id: Vista; label: string; visible: boolean }[] = [
    { id: "catalogo", label: "Catálogo", visible: true },
    { id: "mis-cursos", label: "Mis cursos", visible: me?.role === "student" },
    { id: "estado", label: "Estado", visible: true },
    { id: "sesion", label: "Ingresar", visible: !me },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="marca">MOOC</div>
        <nav>
          {pestañas
            .filter((p) => p.visible)
            .map((p) => (
              <button
                key={p.id}
                className={vista === p.id ? "tab activa" : "tab"}
                onClick={() => setVista(p.id)}
              >
                {p.label}
              </button>
            ))}
        </nav>
        <div className="usuario">
          {me ? (
            <>
              <span>
                {me.username} <small>({me.role})</small>
              </span>
              <button className="enlace" onClick={salir}>
                Salir
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="contenido">
        {vista === "catalogo" && <Catalogo me={me} onIngresar={() => setVista("sesion")} />}
        {vista === "mis-cursos" && me && <MisCursos />}
        {vista === "estado" && <Estado />}
        {vista === "sesion" && !me && (
          <Sesion
            onLogin={async () => {
              await cargarSesion();
              setVista("catalogo");
            }}
          />
        )}
      </main>
    </div>
  );
}
