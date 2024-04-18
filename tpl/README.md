# @mizchi/tpl

Magic inferred template (to manage my AI prompts)

```ts
import { tpl } from "./mod.ts"

const t = tpl`
hello my template

${'@a'}
${'@b'}
  ${'@c'}
`;

// inferred parameter types
const result = t({
  'a': 'xxx',
  'b': 'yyy',
  'c': 'p1\np2',
});

console.log(result);

/*
hello my template

xxx
yyy
  p1 # keep indent in inserted values
  p2
*/
```

## LICENSE

MIT