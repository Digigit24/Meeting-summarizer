import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        offscreen: resolve(__dirname, "offscreen.html"),
        background: resolve(__dirname, "src/background/background.js"),
        scraper: resolve(__dirname, "src/content/scraper.js"),
        floatingWidget: resolve(__dirname, "src/content/floatingWidget.js"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background")
            return "src/background/background.js";
          if (chunkInfo.name === "scraper") return "src/content/scraper.js";
          if (chunkInfo.name === "floatingWidget")
            return "src/content/floatingWidget.js";
          if (chunkInfo.name === "offscreen")
            return "src/offscreen/offscreen.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
