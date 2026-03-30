import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API and static-file requests to the FastAPI backend so the
    // frontend never has to hard-code a port or deal with CORS in dev.
    proxy: {
      "/jobs": "http://localhost:8000",
      "/images": "http://localhost:8000",
      "/models": "http://localhost:8000",
      "/generated": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
