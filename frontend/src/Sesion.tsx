import { useState, type FormEvent } from "react";
import { api, ApiError, setToken } from "./api";

type Modo = "login" | "registro" | "verificar";

function mensaje(e: unknown) {
  return e instanceof ApiError ? e.message : "No se pudo contactar la API";
}

export function Sesion({ onLogin }: { onLogin: () => Promise<void> }) {
  const [modo, setModo] = useState<Modo>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      if (modo === "login") {
        const { data } = await api<{ token: string }>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        setToken(data.token);
        await onLogin();
      } else if (modo === "registro") {
        const { data } = await api<{ message: string }>("/api/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, email, password, role: "student" }),
        });
        setAviso(`${data.message}. Revisa el código de verificación en tu correo.`);
        setModo("verificar");
      } else {
        const q = new URLSearchParams({ username, code });
        const { data } = await api<{ message: string }>(`/api/v1/auth/verify?${q}`);
        setAviso(`${data.message}. Ya puedes ingresar.`);
        setModo("login");
      }
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="formulario">
      <div className="modos">
        <button className={modo === "login" ? "tab activa" : "tab"} onClick={() => setModo("login")}>
          Ingresar
        </button>
        <button
          className={modo === "registro" ? "tab activa" : "tab"}
          onClick={() => setModo("registro")}
        >
          Registrarse
        </button>
        <button
          className={modo === "verificar" ? "tab activa" : "tab"}
          onClick={() => setModo("verificar")}
        >
          Verificar cuenta
        </button>
      </div>

      <form onSubmit={enviar}>
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
        </label>

        {modo === "registro" && (
          <>
            <label>
              Correo
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <p className="ayuda">
              El registro abierto crea cuentas de estudiante; las de profesor las crea un administrador.
            </p>
          </>
        )}

        {modo !== "verificar" && (
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={modo === "login" ? "current-password" : "new-password"}
            />
          </label>
        )}

        {modo === "verificar" && (
          <label>
            Código
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}

        <button type="submit" disabled={enviando}>
          {modo === "login" ? "Ingresar" : modo === "registro" ? "Crear cuenta" : "Verificar"}
        </button>
      </form>
    </section>
  );
}
