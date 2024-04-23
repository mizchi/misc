import { tpl } from "@mizchi/tpl";
const t = tpl`hello ${"@name"}`;
console.log(t({ name: "world" }));
