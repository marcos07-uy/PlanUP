import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: { global: "globalThis" },
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "PlanUp",
        short_name: "PlanUp",
        description: "Programacion de entrenamientos simple para coaches y atletas.",
        theme_color: "#17231d",
        background_color: "#f4f2eb",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: { navigateFallback: "/index.html" }
    })
  ]
});
