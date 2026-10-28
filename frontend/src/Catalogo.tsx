import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type CourseDetail, type CoursesResponse, type Me } from "./api";

const POR_PAGINA = 12;

export function Catalogo({ me, onIngresar }: { me: Me | null; onIngresar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<CoursesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    const q = new URLSearchParams({ page: String(pagina), limit: String(POR_PAGINA) });
    if (consulta) q.set("search", consulta);
    api<CoursesResponse>(`/api/v1/courses?${q}`)
      .then(({ data }) => vigente && setDatos(data))
      .catch((e) => vigente && setError(e instanceof ApiError ? e.message : "No se pudo cargar el catálogo"))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consulta, pagina]);

  function buscar(e: FormEvent) {
    e.preventDefault();
    setPagina(1);
    setConsulta(busqueda.trim());
  }

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / POR_PAGINA)) : 1;

  if (abierto !== null) {
    return <DetalleCurso id={abierto} me={me} onVolver={() => setAbierto(null)} onIngresar={onIngresar} />;
  }

  return (
    <section>
      <h1>Catálogo de cursos</h1>
      <form className="busqueda" onSubmit={buscar}>
        <input placeholder="Buscar por título" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="submit">Buscar</button>
      </form>

      {error && <p className="error">{error}</p>}
      {cargando && !datos && <p className="ayuda">Cargando…</p>}
      {datos && datos.courses.length === 0 && <p className="ayuda">No hay cursos publicados.</p>}

      <div className="cursos">
        {datos?.courses.map((c) => (
          <button key={c.id} className="curso" onClick={() => setAbierto(c.id)}>
            <h3>{c.title}</h3>
            <p>{c.description || "Sin descripción"}</p>
          </button>
        ))}
      </div>

      {datos && paginas > 1 && (
        <div className="paginacion">
          <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span>
            Página {pagina} de {paginas}
          </span>
          <button disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}

function DetalleCurso({
  id,
  me,
  onVolver,
  onIngresar,
}: {
  id: number;
  me: Me | null;
  onVolver: () => void;
  onIngresar: () => void;
}) {
  const [detalle, setDetalle] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    api<CourseDetail>(`/api/v1/courses/${id}`)
      .then(({ data }) => setDetalle(data))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar el curso"));
  }, [id]);

  async function inscribirse() {
    setError(null);
    setAviso(null);
    try {
      await api("/api/v1/enrollments", { method: "POST", body: JSON.stringify({ course_id: id }) });
      setAviso("Inscripción registrada. El curso aparece en «Mis cursos».");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo inscribir");
    }
  }

  const modulos = detalle?.version?.modules ?? detalle?.course.current_version?.modules ?? [];

  return (
    <section>
      <button className="enlace" onClick={onVolver}>
        ← Volver al catálogo
      </button>
      {error && <p className="error">{error}</p>}
      {!detalle && !error && <p className="ayuda">Cargando…</p>}
      {detalle && (
        <>
          <h1>{detalle.course.title}</h1>
          <p>{detalle.course.description}</p>

          {me?.role === "student" && (
            <button onClick={inscribirse}>Inscribirme</button>
          )}
          {!me && (
            <button className="secundario" onClick={onIngresar}>
              Ingresa para inscribirte
            </button>
          )}
          {aviso && <p className="aviso">{aviso}</p>}

          <h2>Contenido</h2>
          {modulos.length === 0 && <p className="ayuda">Este curso todavía no tiene módulos.</p>}
          <ol className="modulos">
            {[...modulos]
              .sort((a, b) => a.position - b.position)
              .map((m) => (
                <li key={m.id}>
                  <strong>{m.title}</strong>
                  {m.units && m.units.length > 0 && (
                    <ul>
                      {[...m.units]
                        .sort((a, b) => a.position - b.position)
                        .map((u) => (
                          <li key={u.id}>
                            {u.title}
                            {u.resources && u.resources.length > 0 && (
                              <span className="ayuda"> · {u.resources.length} recurso(s)</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
          </ol>
        </>
      )}
    </section>
  );
}
