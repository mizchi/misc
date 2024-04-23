import { defineConfig } from "npm:vite@5.2.10";
import { viteDeno } from '../mod.ts';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: Deno.env.get("ENTRY")!,
      formats: ["es"]
    }
  },
  plugins: [viteDeno({})]
});
