import { tpl } from "jsr:@mizchi/tpl";
const t = tpl`hello ${"@name"}`;
console.log(t({ name: "world" }));
