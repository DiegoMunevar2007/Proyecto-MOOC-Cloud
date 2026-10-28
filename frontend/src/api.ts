// Cliente mínimo de la API. Todas las rutas son relativas: en GCP el
// balanceador sirve frontend y API en el mismo origen, y en desarrollo el
// proxy de Vite hace lo mismo.

const TOKEN_KEY = "mooc.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento (modo privado): la sesión dura lo que la pestaña.
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ApiResponse<T> {
  data: T;
  servedBy: string | null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string; message?: string } | null)?.error ??
      (body as { message?: string } | null)?.message ??
      `Error ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return { data: body as T, servedBy: res.headers.get("X-Served-By") };
}

// Tipos de las respuestas que usa el frontend (subconjunto de openapi.json).

export interface Me {
  username: string;
  role: "student" | "professor" | "admin" | string;
}

export interface Resource {
  id: number;
  title: string;
  type: string;
  processing_status?: string;
}

export interface Unit {
  id: number;
  title: string;
  position: number;
  resources?: Resource[];
}

export interface Module {
  id: number;
  title: string;
  description?: string;
  position: number;
  units?: Unit[];
}

export interface CourseVersion {
  id: number;
  number: number;
  status: string;
  modules?: Module[];
}

export interface Course {
  id: number;
  title: string;
  description: string;
  slug: string;
  status: string;
  created_at: string;
  current_version?: CourseVersion;
}

export interface CoursesResponse {
  courses: Course[];
  total: number;
  page: number;
  limit: number;
}

export interface CourseDetail {
  course: Course;
  version?: CourseVersion;
}

export interface Enrollment {
  id: number;
  course_id: number;
  status: string;
  inscrito: boolean;
  fecha_inscripcion: string;
}
