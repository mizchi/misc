import { createGraph } from "jsr:@deno/graph@0.74.4";

const g1 = await createGraph("jsr:@mizchi/tpl@0.0.3");
console.log("g1", g1);

const g2 = await createGraph("npm:zod@3.23.6");
console.log("g2", g2);

/**
g1 {
  roots: [ "jsr:@mizchi/tpl@0.0.3" ],
  modules: [
    {
      kind: "esm",
      size: 5498,
      mediaType: "TypeScript",
      specifier: "https://jsr.io/@mizchi/tpl/0.0.3/mod.ts"
    }
  ],
  redirects: {
    "jsr:@mizchi/tpl@0.0.3": "https://jsr.io/@mizchi/tpl/0.0.3/mod.ts"
  },
  packages: { "@mizchi/tpl@0.0.3": "@mizchi/tpl@0.0.3" }
}
g2 {
  roots: [ "npm:zod@3.23.6" ],
  modules: [
    {
      specifier: "npm:zod@3.23.6",
      error: 'Module not found "npm:zod@3.23.6".'
    }
  ],
  redirects: {}
}
 */