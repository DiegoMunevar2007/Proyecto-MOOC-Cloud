import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En producción el balanceador sirve el frontend y la API en el mismo origen
// (/api, /health y /openapi.json van a la API), así que el código llama a rutas
// relativas. En desarrollo el servidor de Vite hace lo mismo con un proxy hacia
// la API local, y tampoco hace falta CORS.
const api = process.env.API_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": api,
      "/health": api,
      "/openapi.json": api,
    },
  },
});
