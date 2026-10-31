import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, type Me } from "@/lib/api";

interface Sesion {
  me: Me | null;
  cargando: boolean;
  iniciarSesion: (token: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [cargando, setCargando] = useState(() => getToken() !== null);

  const cargar = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setCargando(false);
      return;
    }
    try {
      const { data } = await api<Me>("/api/v1/auth/me");
      setMe(data);
    } catch {
      // Token vencido o revocado: se descarta.
      setToken(null);
      setMe(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const iniciarSesion = useCallback(
    async (token: string) => {
      setToken(token);
      await cargar();
    },
    [cargar],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Aunque falle en el servidor, la sesión local se cierra.
    }
    setToken(null);
    setMe(null);
  }, []);

  const valor = useMemo(() => ({ me, cargando, iniciarSesion, cerrarSesion }), [me, cargando, iniciarSesion, cerrarSesion]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}

export const ROLES: Record<string, string> = {
  student: "Estudiante",
  professor: "Profesor",
  admin: "Administrador",
};
