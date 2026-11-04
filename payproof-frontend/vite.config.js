import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const backend = "https://payproof-backend-3n08.onrender.com";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
      },
      "/oauth2": {
        target: backend,
        changeOrigin: true,
      },
      "/login/oauth2": {
        target: backend,
        changeOrigin: true,
      },
    },
  },
});