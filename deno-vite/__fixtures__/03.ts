import { tpl } from "jsr:@mizchi/tpl@0.0.3";
const t = tpl`hello ${"@name"}`;
console.log(t({ name: "world" }));
