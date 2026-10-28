import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { BookOpen, GraduationCap, LogOut, Menu, Moon, Activity, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { ROLES, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function useEnlaces() {
  const { me } = useAuth();
  return [
    { to: "/", label: "Catálogo", icono: BookOpen, end: true, visible: true },
    { to: "/mis-cursos", label: "Mis cursos", icono: GraduationCap, end: false, visible: me?.role === "student" },
    { to: "/estado", label: "Estado", icono: Activity, end: false, visible: true },
  ].filter((e) => e.visible);
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const oscuro = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      onClick={() => setTheme(oscuro ? "light" : "dark")}
    >
      {oscuro ? <Sun /> : <Moon />}
    </Button>
  );
}

function MenuUsuario() {
  const { me, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const iniciales = me.username.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 rounded-full pr-3 pl-1" aria-label="Menú de la cuenta">
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand text-xs font-semibold text-brand-foreground">{iniciales}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{me.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-sm font-medium text-foreground">{me.username}</span>
          <span className="text-xs text-muted-foreground">{ROLES[me.role] ?? me.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me.role === "student" && (
          <DropdownMenuItem onSelect={() => navigate("/mis-cursos")}>
            <GraduationCap /> Mis cursos
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await cerrarSesion();
            navigate("/");
          }}
        >
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Cabecera() {
  const { me, cargando } = useAuth();
  const enlaces = useEnlaces();
  const [abierto, setAbierto] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir el menú">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>
                <Logo />
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4" aria-label="Principal">
              {enlaces.map(({ to, label, icono: Icono, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setAbierto(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                >
                  <Icono className="size-5" /> {label}
                </NavLink>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" aria-label="MOOC, ir al catálogo" className="mr-4 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {enlaces.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none",
                "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
              )}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {me ? (
            <MenuUsuario />
          ) : (
            !cargando && (
              <Button asChild className="ml-1">
                <Link to="/ingresar">Ingresar</Link>
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <Cabecera />
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Logo className="[&>span:last-child]:text-base" />
          <p>Plataforma MOOC · ISIS4426</p>
        </div>
      </footer>
    </div>
  );
}
