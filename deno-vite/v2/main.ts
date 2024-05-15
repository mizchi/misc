//------------- simple
// import { tpl } from "jsr:@mizchi/tpl@0.0.3";

// const x = tpl`
// Hello, ${"@name"}!
// `;

// const ret = x({ name: "world" });
// console.log(ret);

//-------- nested
// import { join } from "jsr:@std/path@0.223.0";
// console.log(join("a", "b"));

//-------- npm
// import { z } from 'npm:zod@3.22.4';
// const schema = z.object({
//   name: z.string()
// });

//----- react
import { createElement } from "npm:react@18.3.1";
console.log(createElement("div", null, "Hello"));