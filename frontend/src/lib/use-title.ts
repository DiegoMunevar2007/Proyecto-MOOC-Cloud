import { useEffect } from "react";

export function useTitle(titulo?: string) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · MOOC` : "MOOC";
  }, [titulo]);
}
