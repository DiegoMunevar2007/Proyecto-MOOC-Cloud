import {
  AudioLines,
  FileText,
  Image as Imagen,
  Link2,
  ListChecks,
  Paperclip,
  Presentation,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";

// Tipos de recurso (backend/courses/coursemodels.go).
const TIPOS: Record<string, { etiqueta: string; icono: LucideIcon }> = {
  text: { etiqueta: "Lectura", icono: FileText },
  video: { etiqueta: "Video", icono: PlayCircle },
  audio: { etiqueta: "Audio", icono: AudioLines },
  pdf: { etiqueta: "PDF", icono: FileText },
  slides: { etiqueta: "Diapositivas", icono: Presentation },
  image: { etiqueta: "Imagen", icono: Imagen },
  quiz: { etiqueta: "Quiz", icono: ListChecks },
  link: { etiqueta: "Enlace", icono: Link2 },
  iframe: { etiqueta: "Contenido externo", icono: Link2 },
  file: { etiqueta: "Archivo", icono: Paperclip },
};

export function infoRecurso(tipo: string) {
  return TIPOS[tipo] ?? { etiqueta: tipo, icono: Paperclip };
}
