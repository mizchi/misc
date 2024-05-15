# @mizchi/vite-deno

WIP

Deno resolver emulator on vite loader

```ts
// vite.config.mts
import { defineConfig, Plugin } from "npm:vite@5.2.10";
import { viteDeno } from 'jsr:@mizchi/vite-deno@0.0.1';

export default defineConfig({
  plugins: [viteDeno()]
});
```

Run vite on deno.

```bash
$ deno run -A npm:vite
```

## Compileable Example

```ts
// import from jsr
import {tpl} from "jsr:@mizchi/tpl@0.0.3";
// without version
import {tpl} from "jsr:@mizchi/tpl";
// deno add @mizchi/tpl
import {tpl} from "@mizchi/tpl";
```

## TODO

- [x] Support `jsr:`
- [ ] Support `npm:`
- [ ] Support `https://`

## LICENSE

MIT