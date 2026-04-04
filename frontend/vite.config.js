import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API and static-file requests to the FastAPI backend so the
    // frontend never has to hard-code a port or deal with CORS in dev.
    proxy: {
      "/jobs": apiProxyTarget,
      "/images": apiProxyTarget,
      "/models": apiProxyTarget,
      "/generated": apiProxyTarget,
      "/health": apiProxyTarget,
    },
  },
});
