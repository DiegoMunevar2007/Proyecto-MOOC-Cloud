import { Component, type ErrorInfo, type ReactNode } from "react";

// Sin esto, un error al renderizar deja la página en blanco y no hay forma de
// saber qué pasó. Muestra el mensaje y permite reintentar.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de render:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">Algo salió mal al mostrar la página</h1>
        <pre className="overflow-auto rounded-lg border bg-muted p-3 text-sm whitespace-pre-wrap">
          {error.name}: {error.message}
        </pre>
        <button
          type="button"
          className="h-10 w-fit rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          onClick={() => location.reload()}
        >
          Recargar
        </button>
      </main>
    );
  }
}
