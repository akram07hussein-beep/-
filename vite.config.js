import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// إعداد Vite — يبني التطبيق إلى مجلد dist الجاهز للنشر
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
});
