// ex. scripts/build_npm.ts
import * as dnt from "https://deno.land/x/dnt@0.40.0/mod.ts";
import jsr from "../jsr.json" with { type: "json" };

export async function build() {
  await dnt.emptyDir("./npm");
  await dnt.build({
    entryPoints: ["./mod.ts"],
    outDir: "./npm",
    test: false,
    shims: { deno: false },
    package: {
      type: "module",
      name: jsr.name,
      version: jsr.version,
      description: "simple template builder",
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/mizchi/previs.git",
      },
    },
    postBuild() { },
  });
}

if (import.meta.main) {
  await build();
}