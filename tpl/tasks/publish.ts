import $ from "https://deno.land/x/dax@0.39.2/mod.ts";
import { build } from "./build.ts";

await build();
await $`deno task test`;
await $`jsr publish`;