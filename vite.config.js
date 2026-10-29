import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
    // Désactivation du minifier agressif pour éviter les bugs de scope en prod
    minify: 'esbuild' 
  }
});
