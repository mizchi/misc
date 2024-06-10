import { add } from "./sample.ts";
Deno.test("sample test", () => {
  const result = add(1, 2);
  console.log(result);
  console.assert(result === 3);
});