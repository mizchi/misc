import { expect } from "https://deno.land/std@0.214.0/expect/expect.ts";
import { tpl, each, when } from "./tpl.ts";

Deno.test('complex', () => {
  const t1 = tpl`
    ${'@a'} = ${'@b'} | ${'raw'}
      ${'!ml'}
  `;
  const result = t1({
    a: 'x',
    b: 'y',
    ml: 'd\nnl',
  });

  expect(result).toEqual('x = y | raw\n  d\n  nl');
});

Deno.test('compose', () => {
  const template = tpl`
    ${each('@items', tpl`
      ${'@key'} = ${'@value'}
    `)}
    ${each('@xs', tpl`
      ${'@v'}
    `, ' ')}
    ${'@key'} on top
    ${when('@flag', tpl`
      ${'@key'} is active
    `)}
    ${when('@flag2',
    tpl`${'@thenKey'} is active`,
    tpl`else: ${'@elseKey'}`
  )}
  `;

  const result = template({
    flag: true,
    flag2: false,
    thenKey: 'then',
    elseKey: 'else',
    key: 'key0',
    xs: [{ v: 'x' }, { v: 'y' }],
    items: [
      { key: 'x', value: 'y' },
      { key: 'z', value: 'w' },
    ]
  });
  expect(result).toEqual('x = y\nz = w\nx y\nkey0 on top\nkey0 is active\nelse: else');
});