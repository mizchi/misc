import { expect } from 'https://deno.land/std@0.214.0/expect/expect.ts';
import { hello } from "./mod.ts";
Deno.test("myapp", () => {
  expect(hello()).toBe("hello");
});