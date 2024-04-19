# @mizchi/unites

Simple universal test runner wrapper.

Supported

- `deno test`
- `node --test`
- `vitest`

## Install

```
$ deno add @mizchi/unites
$ npm install -D @mizchi/unites
```

## Usage

Put `foo.test.js`

```js
// node or deno node-compat mode
import { test, eq } from '@mizchi/unites';
// if you want node compat, use `npm:@mizchi/unites`
test('1 === 1', () => {
  eq(1, 1);
});
```

Node.js

```bash
node --test foo.test.js
```


Deno.js

```bash
node --test foo.test.js
```

vitest

```bash
$ npx vitest foo.test.js
```


## LICENSE

MIT