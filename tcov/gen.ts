import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std/testing/asserts.ts";

export function add(a: number, b: number): number {
  return a + b;
}

export function sub(a: number, b: number): number {
  return a - b;
}

export function mul(a: number, b: number): number {
  return a * b;
}

export function div(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero is not allowed");
  }
  return a / b;
}

Deno.test("add function", () => {
  assertEquals(add(1, 2), 3);
  assertEquals(add(0, 0), 0);
  assertEquals(add(-1, 1), 0);
  assertEquals(add(-1, -1), -2);
});

Deno.test("sub function", () => {
  assertEquals(sub(2, 1), 1);
  assertEquals(sub(0, 0), 0);
  assertEquals(sub(1, -1), 2);
  assertEquals(sub(-1, -1), 0);
});

Deno.test("mul function", () => {
  assertEquals(mul(2, 3), 6);
  assertEquals(mul(0, 1), 0);
  assertEquals(mul(-1, 1), -1);
  assertEquals(mul(-1, -1), 1);
});

Deno.test("div function", () => {
  assertEquals(div(6, 3), 2);
  assertEquals(div(0, 1), 0);
  assertThrows(() => div(1, 0), Error, "Division by zero is not allowed");
  assertEquals(div(-6, -3), 2);
});