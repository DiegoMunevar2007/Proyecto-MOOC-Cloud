import { Link } from "react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useTitle } from "@/lib/use-title";

export function NoEncontrado() {
  useTitle("Página no encontrada");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <EmptyState
        icono={Compass}
        titulo="Esta página no existe"
        accion={
          <Button asChild>
            <Link to="/">Ir al catálogo</Link>
          </Button>
        }
      >
        Revisa el enlace o vuelve al inicio para explorar los cursos.
      </EmptyState>
    </div>
  );
}
