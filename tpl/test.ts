import { tpl } from "./mod.ts"

const t = tpl`
hello template

${'@a'}

${'@b'}

  ${'@c'}
`;

const result = t({
  'a': 'a',
  'b': 'b',
  'c': 'c1\nc2',
});

console.log(result);