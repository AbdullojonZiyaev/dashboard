import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import chatPlugin from "./server/chatPlugin.js";

// /backend/* is forwarded to the backend API (system/backend), so the browser
// needs no CORS setup. Point BACKEND_URL elsewhere if the API runs on another host.
const backend = {
  "/backend": {
    target: process.env.BACKEND_URL || "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/backend/, ""),
  },
};

export default defineConfig({
  plugins: [react(), chatPlugin()],
  server: { proxy: backend },
  preview: { proxy: backend },
});
