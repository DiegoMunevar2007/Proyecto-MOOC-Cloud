import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, SearchX, Search, TriangleAlert, Library } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarrasMarca } from "@/components/barras-marca";
import { CourseCard, CourseCardSkeleton } from "@/components/course-card";
import { EmptyState } from "@/components/empty-state";
import { api, ApiError, type CoursesResponse } from "@/lib/api";
import { useInscripciones } from "@/lib/inscripciones";
import { plural } from "@/lib/cursos";
import { useTitle } from "@/lib/use-title";

const POR_PAGINA = 9;

const ORDENES = [
  { value: "created_at desc", label: "Más recientes" },
  { value: "created_at asc", label: "Más antiguos" },
  { value: "title asc", label: "Título, A a Z" },
  { value: "title desc", label: "Título, Z a A" },
];

function Hero({ busqueda, onBuscar }: { busqueda: string; onBuscar: (q: string) => void }) {
  const [valor, setValor] = useState(busqueda);
  useEffect(() => setValor(busqueda), [busqueda]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onBuscar(valor.trim());
  }

  return (
    <section className="relative isolate overflow-hidden bg-brand text-brand-foreground">
      <div className="mx-auto grid max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
            Aprende a tu ritmo, un curso a la vez.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-brand-muted">
            Videos, lecturas y quizzes con seguimiento de tu avance y insignias que puedes verificar.
          </p>
          <form onSubmit={enviar} role="search" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-[oklch(0.46_0.035_265)]" />
              <Input
                type="search"
                name="q"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Busca por tema o título"
                aria-label="Buscar cursos"
                className="h-12 rounded-xl border-transparent bg-[oklch(0.985_0.004_265)] pl-11 text-base text-[oklch(0.2_0.045_265)] placeholder:text-[oklch(0.46_0.035_265)] dark:bg-[oklch(0.985_0.004_265)]"
              />
            </div>
            <Button type="submit" variant="signal" size="lg" className="h-12">
              Buscar cursos
            </Button>
          </form>
        </div>
      </div>

      <BarrasMarca className="absolute right-6 bottom-0 -z-10 hidden h-[88%] lg:flex xl:right-16" />
    </section>
  );
}

export function Catalogo() {
  useTitle("Catálogo");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const pagina = Math.max(1, Number(params.get("pagina")) || 1);
  const orden = params.get("orden") ?? ORDENES[0].value;

  const [datos, setDatos] = useState<CoursesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const { activos } = useInscripciones();

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setError(null);
    const consulta = new URLSearchParams({ page: String(pagina), limit: String(POR_PAGINA), sort: orden });
    if (q) consulta.set("search", q);
    api<CoursesResponse>(`/api/v1/courses?${consulta}`, { signal: control.signal })
      .then(({ data }) => setDatos(data))
      .catch((e) => {
        if (control.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : "No se pudo contactar la API");
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [q, pagina, orden, intento]);

  function actualizar(cambios: Record<string, string | null>) {
    const siguiente = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") siguiente.delete(k);
      else siguiente.set(k, v);
    }
    setParams(siguiente);
  }

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / POR_PAGINA)) : 1;

  return (
    <>
      <Hero busqueda={q} onBuscar={(valor) => actualizar({ q: valor, pagina: null })} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">
            {q ? `Resultados para «${q}»` : "Todos los cursos"}
            {datos && (
              <span className="ml-3 text-base font-medium text-muted-foreground">
                {plural(datos.total, "curso", "cursos")}
              </span>
            )}
          </h2>
          <Select value={orden} onValueChange={(v) => actualizar({ orden: v === ORDENES[0].value ? null : v, pagina: null })}>
            <SelectTrigger className="w-44" aria-label="Ordenar cursos">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {ORDENES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <TriangleAlert />
            <AlertTitle>No se pudo cargar el catálogo</AlertTitle>
            <AlertDescription>
              {error}
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {cargando && !datos && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        )}

        {datos && datos.courses.length === 0 && !error && (
          <EmptyState
            icono={q ? SearchX : Library}
            titulo={q ? "Ningún curso coincide con tu búsqueda" : "Aún no hay cursos publicados"}
            accion={
              q ? (
                <Button variant="outline" onClick={() => actualizar({ q: null, pagina: null })}>
                  Ver todos los cursos
                </Button>
              ) : undefined
            }
          >
            {q ? "Prueba con otra palabra o revisa la ortografía." : "Cuando un profesor publique un curso, aparecerá aquí."}
          </EmptyState>
        )}

        {datos && datos.courses.length > 0 && (
          <div
            className="grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3"
            style={{ opacity: cargando ? 0.55 : 1 }}
            aria-busy={cargando}
          >
            {datos.courses.map((c) => (
              <CourseCard key={c.id} curso={c} inscrito={activos.has(c.id)} />
            ))}
          </div>
        )}

        {datos && paginas > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Paginación">
            <Button variant="outline" disabled={pagina <= 1} onClick={() => actualizar({ pagina: String(pagina - 1) })}>
              <ChevronLeft /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {pagina} de {paginas}
            </span>
            <Button variant="outline" disabled={pagina >= paginas} onClick={() => actualizar({ pagina: String(pagina + 1) })}>
              Siguiente <ChevronRight />
            </Button>
          </nav>
        )}

      </div>
    </>
  );
}
