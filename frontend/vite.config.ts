import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API calls to FastAPI so we don't hit CORS in dev
      "/tasks": "http://localhost:8000",
      "/auth": "http://localhost:8000",
      "/feedback": "http://localhost:8000",
      "/health": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
