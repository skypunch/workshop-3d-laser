import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the built asset paths relative, which is what GitHub Pages
// needs when the site is served from https://<user>.github.io/<repo>/.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
