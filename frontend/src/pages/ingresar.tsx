import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, Loader2, MailCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarrasMarca } from "@/components/barras-marca";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTitle } from "@/lib/use-title";

type Paso = "ingresar" | "crear" | "verificar";

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo contactar la API");

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

function CampoContrasena({ id, valor, onChange, nueva }: { id: string; valor: string; onChange: (v: string) => void; nueva?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={nueva ? "new-password" : "current-password"}
        className="pr-11"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

export function Ingresar() {
  useTitle("Ingresar");
  const { me, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const volver = params.get("volver");
  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";

  const [paso, setPaso] = useState<Paso>("ingresar");
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (me) return <Navigate to={destino} replace />;

  async function correr(accion: () => Promise<void>) {
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setEnviando(false);
    }
  }

  function entrar(e: FormEvent) {
    e.preventDefault();
    void correr(async () => {
      const { data } = await api<{ token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: usuario, password: contrasena }),
      });
      await iniciarSesion(data.token);
      await navigate(destino, { replace: true });
    });
  }

  function crear(e: FormEvent) {
    e.preventDefault();
    void correr(async () => {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ username: usuario, email: correo, password: contrasena, role: "student" }),
      });
      setCodigo("");
      setPaso("verificar");
    });
  }

  function verificar(valor: string) {
    void correr(async () => {
      await api(`/api/v1/auth/verify?${new URLSearchParams({ username: usuario, code: valor })}`);
      toast.success("Cuenta verificada. Ya puedes ingresar.");
      setContrasena("");
      setPaso("ingresar");
    });
  }

  function reenviar() {
    void correr(async () => {
      await api("/api/v1/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ username: usuario, email: correo }),
      });
      toast.success("Te enviamos un código nuevo.");
    });
  }

  function cambiarPaso(siguiente: Paso) {
    setError(null);
    setPaso(siguiente);
  }

  return (
    <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand text-brand-foreground lg:block">
        <div className="relative z-10 flex h-full max-w-xl flex-col justify-center gap-6 p-12 xl:p-16">
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight xl:text-5xl">Tu próximo curso empieza aquí.</h1>
          <p className="text-lg text-brand-muted">Inscríbete, avanza a tu ritmo y gana insignias que puedes compartir.</p>
        </div>
        <BarrasMarca className="absolute right-10 bottom-0 flex h-[42%]" />
      </aside>

      <section className="flex items-start justify-center px-4 py-10 sm:px-6 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          {paso === "verificar" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                  <MailCheck className="size-6" />
                </span>
                <h2 className="text-3xl font-bold tracking-tight">Verifica tu cuenta</h2>
                <p className="text-muted-foreground">
                  {correo ? `Escribe el código de 6 dígitos que enviamos a ${correo}.` : "Escribe el código de 6 dígitos que llegó a tu correo."}
                </p>
              </div>

              {!usuario && (
                <Campo id="usuario-verificar" etiqueta="Usuario">
                  <Input id="usuario-verificar" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
                </Campo>
              )}

              <div className="space-y-2">
                <Label htmlFor="codigo">Código de verificación</Label>
                <InputOTP
                  id="codigo"
                  maxLength={6}
                  value={codigo}
                  onChange={setCodigo}
                  onComplete={verificar}
                  disabled={enviando || !usuario}
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Button size="lg" disabled={enviando || codigo.length < 6} onClick={() => verificar(codigo)}>
                  {enviando && <Loader2 className="animate-spin" />} Verificar cuenta
                </Button>
                {correo && (
                  <Button variant="ghost" disabled={enviando} onClick={reenviar}>
                    Reenviar el código
                  </Button>
                )}
                <Button variant="ghost" className="text-muted-foreground" onClick={() => cambiarPaso("ingresar")}>
                  Volver a ingresar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <h2 className="text-3xl font-bold tracking-tight">{paso === "ingresar" ? "Te damos la bienvenida" : "Crea tu cuenta"}</h2>
                <p className="text-muted-foreground">
                  {paso === "ingresar" ? "Ingresa para retomar tus cursos." : "Es gratis y toma un minuto."}
                </p>
              </div>

              <Tabs value={paso} onValueChange={(v) => cambiarPaso(v as Paso)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ingresar">Ingresar</TabsTrigger>
                  <TabsTrigger value="crear">Crear cuenta</TabsTrigger>
                </TabsList>
              </Tabs>

              <form onSubmit={paso === "ingresar" ? entrar : crear} className="space-y-4">
                <Campo id="usuario" etiqueta="Usuario">
                  <Input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required autoComplete="username" autoFocus />
                </Campo>
                {paso === "crear" && (
                  <Campo id="correo" etiqueta="Correo">
                    <Input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoComplete="email" />
                  </Campo>
                )}
                <Campo id="contrasena" etiqueta="Contraseña">
                  <CampoContrasena id="contrasena" valor={contrasena} onChange={setContrasena} nueva={paso === "crear"} />
                </Campo>

                {error && (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={enviando}>
                  {enviando && <Loader2 className="animate-spin" />}
                  {paso === "ingresar" ? "Ingresar" : "Crear cuenta"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes un código?{" "}
                <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => cambiarPaso("verificar")}>
                  Verifica tu cuenta
                </button>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
