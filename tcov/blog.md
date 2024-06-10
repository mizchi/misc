# LLM にコードを書き換えさせる差分フォーマットを考える

## 既存の LLM コード生成の問題

LLM は行カウントやワードカウントが苦手。

例えば自分は SourceMap を扱うコードのテストを書かせようとしたが、モックデータの line:column がガバガバな位置を指してまともにテストにならない。行カウント/ワードカウントができないのはつまり diff がうまく生成できない。

これらの問題があって、コードを生成するパイプラインを組む場合、 全文出力が主流になっている。

ここで何が問題になるかというと、コードが膨らんで来た時に、(書き変える対象が一部だとしても)生成が顕著に遅くなる。うまく生成できなかった時にリトライを繰り返すと、問題がさらに悪化する。

## 改善手法の提案: 明示的な Line Number の付与

最近の LLM は入力ウィンドウがある程度大きくても、そこそこの速度で応答する。(お金はかかるが...)

問題は生成速度にある。特に何も指示しない場合、修正コードと修正箇所をファジーに指示してくる。が、人間が扱うならともかく、これは機械的に元コードに適用できるフォーマットとしては扱えない。前述の問題で、 機械的な diff も生成できない。

なので結局全文出力するしかないのだが、ユニットテストを生成する Cover Agent で次の指示を見つけた。

https://www.freecodecamp.org/news/automated-unit-testing-with-testgen-llm-and-cover-agent/?ref=dailydev

> After each individual test has been added, review all tests to ensure they cover the full range of scenarios, including how to handle exceptions or errors.

つまりこういうコードを入力に使っている。

```
1: function add(x: number, y: number): number {
2:   throw new Error("WIP");
3: }
```

Cover Agent のコードを読む限り、カバレッジを上昇させるためにこの Line Number を参照するように動いている。

これが動くなら。明示的に行データを埋め込むコードを理解できるということで、これなら変更差分を適用するのはそう難しくないように思える。

自分は今までコード生成の特化モデルがあることを念頭にパースエラーになるような入力を避けていたが、人間にとっての読みやすさがそのままAIにとっての読みやすさになるなら、このフォーマットが実用可能なのではないか？と考えた。

こういうステップを踏めばいいはず。

1. 元のコードに lineNumber を付与
2. LLM に変更差分を lineNumber 付きで生成させる
3. 出力結果から、元のコードの対応する行を書き換える
4. 最終的な変更から、 lineNumber を除去

結果として、こういうデータを生成するのを期待する。

```
2:   return a + b;
```

## プロンプトの設計

色々と試行錯誤して、これを生成できるシステムプロンプトを作った。

````markdown
あなたは、TypeScpit のソースファイルを受け付けるコードアシスタントです。

あなたの目標は、与えられたコードを分析し、それを修正することです。

追加のガイドライン:

- 提供されたコードを注意深く分析してください。その目的、入力、出力、および実行する重要なロジックや計算を理解してください。
- コードの正確性を完全に検証し、100%のコードカバレッジを達成するために必要と思われるテストケースのリストを考案してください。
- 出力に出力例で提示されるコード以外の出力は許可されません。コードの差分だけを提供してください。

## 出力のルール

- 入力には、書き換える対象を理解するために、手動で各コード行に行番号を追加しています。これらの番号は元のコードの一部ではありません。
- 書き換える対象の行と一緒に、その行を修正するためのコードを提供してください。一行を複数行に書き換えるときは、同じ行の出力を複数回提供してください。
- AST を壊さないでください。その行に意味的に対応するものは、必ず同じ行への出力としてください。入力に存在しない行への差分の出力は許可されません。
- 行を削除する場合は、その行に対応する出力を空にしてください。
- 冒頭に追加する場合、 _: と入力してください。 import 文などを追加する場合に使用してください。
- 末尾に追加する場合、 +: と入力してください。 テストコードの追加などに使用してください。

入力例:

\`\`\`ts
1: 
2:export function add(a: number, b: number): number {
3:  return 0;
4:}
5: 
\`\`\`

出力例1: 単純な置換

\`\`\`ts
3:  return a + b;
\`\`\`

出力例2: 複数行への書き換え

\`\`\`ts
3:  // implement add
3:  return a + b;
\`\`\`

出力例3: 冒頭に追加

\`\`\`ts
_:import {x} from 'module';
\`\`\`


出力例4: 末尾に追加

\`\`\`ts
+:// This file is modified by Code Assistant
\`\`\`


NG:

\`\`\`ts
6: return a + b; // This line number does not existed
\`\`\`
````

ユーザープロンプト

````markdown
このファイルの各関数の実装を提供してください。
Deno.test を使用して、各関数が正しく実装されていることを確認するテストを追加してください。

\`\`\`ts
1: 
2:export function add(a: number, b: number): number {
3:  return 0;
4:}
5: 
\`\`\`
````

冒頭への追加、末尾への追加、行の書き換えを実装した。

gpt-4o に入力すると、このような出力が得られる。

````
```ts
3:   return a + b;
_: import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
+:
+: Deno.test("add function", () => {
+:   assertEquals(add(1, 2), 3);
+:   assertEquals(add(-1, 1), 0);
+:   assertEquals(add(-1, -1), -2);
+: });
```
````

### うまくいかないパターンに対処する

これでうまくいくように思えるが、ファイル末尾に対して元ソースには存在しない行を記述する際、ASTが壊れるような差分を作ることが頻発した。

```ts
3:  // add function
4:  return a + b; // これが } を上書きしてASTが壊れるが、欠損した } を生成しないので Syntax Error になる
```

これに対処する指示がさっきのプロンプトのここ。

````markdown
- 書き換える対象の行と一緒に、その行を修正するためのコードを提供してください。一行を複数行に書き換えるときは、同じ行の出力を複数回提供してください。
- AST を壊さないでください。その行に意味的に対応するものは、必ず同じ行への出力としてください。入力に存在しない行への差分の出力は許可されません。
- 行を削除する場合は、その行に対応する出力を空にしてください。

(中略)

NG:

```ts
6: return a + b; // This line number does not existed
```
````

`+:` で末尾追加の機能を追加したのも、このへんの誤爆を減らすため。

ただ、これでもうまくいかないことがある。成功率は8割ぐらい。

パフォーマンスのために差分を生成するという趣旨からは外れるが、LLM 自身に壊れたコードを修正させることにした。
8割うまくいってるので、取りこぼしに対処できればいいやの精神。

````markdown
あなたの指示で次のようにコードを書き換えましたが、シンタックスエラーが発生しました。
Original を参照しつつ、構文的に問題がないように Fixed に対してシンタックスエラーの修正を試みてください。
出力は差分ではなく、コード全文を出力してください。

## Original

\`\`\`ts
${original}
\`\`\`

## Fixed

\`\`\`ts
${fixed}
\`\`\`

## Error
${errorText}
````

## 実装する

今まで書いたものを自動化するスクリプトを deno で実装した。

```ts
import prettier from "npm:prettier@2.4.1";
import ts from "npm:typescript@5.4.2";

import {OpenAI} from 'npm:openai@4.49.1';
type OpenAIOptions = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

export async function runChat(opts: OpenAIOptions) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const encoder = new TextEncoder();
  const openai = new OpenAI({ apiKey });
  const stream = await openai.chat.completions.create(opts);
  let result = '';
  let stop_reason: OpenAI.ChatCompletionChunk.Choice['finish_reason'] | null = null;
  for await (const message of stream) {
    for (const choice of message.choices) {
      if (choice.delta.content) {
        result += choice.delta.content;
        Deno.stdout.writeSync(encoder.encode(choice.delta.content));
      }
      if (choice.finish_reason) {
        stop_reason = choice.finish_reason;
        break;
      }
    }
  }
  Deno.stdout.writeSync(encoder.encode('\n'));
  return {
    result,
    stop_reason
  };
}

type Delta = {
  line: number;
  code: string;
};

type ParsedOutput = {
  edits: Delta[];
  append: string;
  prepend: string;
};

function addLineNumbers(code: string) {
  const lines = code.split('\n');
  const maxLineNumberLength = String(lines.length).length;
  return lines.map((line, i) => {
    return `${String(i + 1).padStart(maxLineNumberLength, ' ')}: ${line}`;
  }).join('\n');
}

function stripLineNumbers(code: string) {
  return code.split('\n').map(line => {
    return line.replace(/^\s*\d+\s*:\s*/, '');
  }).join('\n');
}

function extractCodeBlocks(code: string) {
  const matches = code.matchAll(/```([^\n]+)?\n([\s\S]+?)?\n```\n?/g);
  const results: string[] = [];
  for (const match of matches) {
    results.push(match[2]);
  }
  return results;
}
function parseOutput(raw: string): ParsedOutput {
  let delta = '';
  const codeBlocks = extractCodeBlocks(raw);
  for (const block of codeBlocks) {
    delta += block;
  }

  const edits = delta.split('\n')
    .filter(line => !Number.isNaN(Number(line.split(":")[0].trim())))
    .map(line => {
      const [lineNumber, ...code] = line.split(':');
      return { line: Number(lineNumber.trim()), code: code.join(":") };
    })
    .sort((a, b) => a.line - b.line)
    .reduce((acc, current) => {
      const last = acc[acc.length - 1];
      if (last && last.line === current.line) {
        last.code += '\n' + current.code;
      } else {
        acc.push(current);
      }
      return acc;
    }, [] as Delta[]);

  const prepend = delta.split('\n')
    .filter(line => line.split(":")[0].trim() == "_")
    .map(line => {
      const colonIndex = line.indexOf(":");
      if (colonIndex == -1) {
        return "";
      }
      return line.slice(colonIndex + 1);
    }).join('\n');

  const append = delta.split('\n')
    .filter(line => line.split(":")[0].trim() == "+")
    .map(line => {
      const colonIndex = line.indexOf(":");
      if (colonIndex == -1) {
        return "";
      }
      return line.slice(colonIndex + 1);
    }).join('\n');
  return {
    edits: edits,
    append,
    prepend
  }
}

function applyChanges(inputCode: string, changes: ParsedOutput) {
  const inputLines = inputCode.split('\n');
  for (const delta of changes.edits) {
    const index = inputLines.findIndex(line => line.match(new RegExp(`^\\s*${delta.line}:`)));
    inputLines[index] = delta.code;
  }
  return changes.prepend + '\n' + inputLines.join('\n') + '\n' + changes.append;
}

// TypeScript の SyntaxError を検証
function getSyntaxErrors(code: string, inputFilename: string = 'example.ts'): string | null {
  const source = ts.createSourceFile(inputFilename, code, ts.ScriptTarget.Latest);
  const diagnostics = getDiagnostics(source);
  if (diagnostics.length === 0) {
    return null;
  }
  let result = '';
  diagnostics.forEach(diagnostic => {
    const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.start!);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    result += `SyntaxError: ${diagnostic.file!.fileName} (${line + 1},${character + 1}): ${message}\n`;
  });
  return result;

  function getDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    const compilerHost: ts.CompilerHost = {
      getSourceFile: (fileName) => fileName === inputFilename ? sourceFile : undefined,
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => { },
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      fileExists: (fileName) => fileName === inputFilename,
      readFile: (fileName) => fileName === inputFilename ? code : undefined,
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    };
    const compilerOptions: ts.CompilerOptions = {
      noEmit: true,
      skipLibCheck: true,
    };
    const program = ts.createProgram(['example.ts'], compilerOptions, compilerHost);
    const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
    return syntacticDiagnostics as ts.Diagnostic[];
  }
}

function formatCode(code: string) {
  const strippedCode = stripLineNumbers(code);
  try {
    const formatted = prettier.format(strippedCode, { parser: "typescript" });
    return formatted;
  } catch (e) {
    console.error('Formatter Parse Error', e);
    return strippedCode;
  }
}

const PROMPT = `
あなたは、TypeScpit のソースファイルを受け付けるコードアシスタントです。

あなたの目標は、与えられたコードを分析し、それを修正することです。

追加のガイドライン:

- 提供されたコードを注意深く分析してください。その目的、入力、出力、および実行する重要なロジックや計算を理解してください。
- コードの正確性を完全に検証し、100%のコードカバレッジを達成するために必要と思われるテストケースのリストを考案してください。
- 出力に出力例で提示されるコード以外の出力は許可されません。コードの差分だけを提供してください。

## 出力のルール

- 入力には、書き換える対象を理解するために、手動で各コード行に行番号を追加しています。これらの番号は元のコードの一部ではありません。
- 書き換える対象の行と一緒に、その行を修正するためのコードを提供してください。一行を複数行に書き換えるときは、同じ行の出力を複数回提供してください。
- 書き換える時に AST を壊さないでください。その行に意味的に対応するものは、必ず同じ行への出力としてください。入力に存在しない行への差分の出力は許可されません。
- 行を削除する場合は、その行に対応する出力を空にしてください。
- 冒頭に追加する場合、 _: と入力してください。 import 文などを追加する場合に使用してください。
- 末尾に追加する場合、 +: と入力してください。 テストコードの追加などに使用してください。

入力例:

\`\`\`ts
1: 
2:export function add(a: number, b: number): number {
3:  return 0;
4:}
5: 
\`\`\`

出力例1: 単純な置換

\`\`\`ts
3:  return a + b;
\`\`\`

出力例2: 複数行への書き換え

\`\`\`ts
3:  // implement add
3:  return a + b;
\`\`\`

出力例3: 冒頭に追加

\`\`\`ts
_:import {x} from 'module';
\`\`\`


出力例4: 末尾に追加

\`\`\`ts
+:// This file is modified by Code Assistant
\`\`\`


NG:

\`\`\`ts
6: return a + b; // Line number is wrong
\`\`\`
`;

function getFixPrompt(opts: {
  original: string;
  fixed: string;
  errorText: string;
}): string {
  return `

あなたは次のようにコードを書き換えましたが、エラーが発生しました。
Original を参照しつつ、構文的に問題がないように Fixed に対してシンタックスエラーの修正を試みてください。
出力は差分ではなく、コード全文を出力してください。

## Original

\`\`\`ts
${addLineNumbers(opts.original)}
\`\`\`

## Fixed

\`\`\`ts
${addLineNumbers(opts.fixed)}
\`\`\`

## Error
${opts.errorText}
`.trim();
}

const MAX_RETRY = 3;
async function fixCode(request: string, code: string, filename: string = 'example.ts') {
  const codeWithLineNumber = addLineNumbers(code);
  const input = `
${request}

# ${filename}

\`\`\`ts
${codeWithLineNumber}
\`\`\`
`;

  const result = await runChat({
    model: 'gpt-4o',
    stream: true,
    messages: [
      {
        role: 'system',
        content: PROMPT
      },
      {
        role: 'user',
        content: input
      }
    ]
  });

  const changes = parseOutput(result.result);
  let fixedCode = applyChanges(codeWithLineNumber, changes);

  let syntaxErrors = getSyntaxErrors(stripLineNumbers(fixedCode));
  if (!syntaxErrors) {
    return {
      ok: true,
      code: formatCode(stripLineNumbers(fixedCode))
    };
  }
  let retries = 0;
  while (MAX_RETRY > retries++) {
    const result = await runChat({
      model: 'gpt-4o',
      stream: true,
      messages: [
        {
          role: 'system',
          content: PROMPT
        },
        {
          role: 'user',
          content: getFixPrompt({
            original: code,
            fixed: fixedCode,
            errorText: syntaxErrors!
          })
        }
      ]
    });
    fixedCode = extractCodeBlocks(result.result)[0];
    const stripped = stripLineNumbers(fixedCode);
    syntaxErrors = getSyntaxErrors(stripped);
    if (!syntaxErrors) {
      return {
        ok: true,
        code: formatCode(stripped)
      };
    }
    console.error("==validation error")
    console.error(syntaxErrors);
  }
  return {
    ok: false,
    error: syntaxErrors
  };
}

const code = `
export function add(a: number, b: number): number {
  throw new Error('Not implemented');
}
`;

const input = `
このファイルの各関数の実装を提供してください。
Deno.test を使用して、各関数が正しく実装されていることを確認するテストを追加してください。
`;


const result = await fixCode(input, code);
if (!result.ok) {
  console.error(result.error);
  Deno.exit(1);
}
console.log('== fixed code ==');
console.log(result.code);
```

パースエラーが起きた際は、TypeScript の Syntax Error をそのままプロンプトに流している。

これはたぶん、元ソースに ariadne 的な感じで埋め込んでしまって、後で除去したほうがいいかもしれない。

https://docs.rs/ariadne/latest/ariadne/

このプログラムを実行する。

````bash
$ deno run -A line-edit.ts
3:   return a + b;
_: import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
+:
+: Deno.test("add function", () => {
+:   assertEquals(add(1, 2), 3);
+:   assertEquals(add(-1, 1), 0);
+:   assertEquals(add(-1, -1), -2);
+: });
== fixed code ==
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

export function add(a: number, b: number): number {
  return a + b;
}

Deno.test("add function", () => {
  assertEquals(add(1, 2), 3);
  assertEquals(add(-1, 1), 0);
  assertEquals(add(-1, -1), -2);
});
````

なんとか動いた。
ちなみにこのテストコード自体も実行できた。

## 考察

この手法は現在の生成速度が遅い+diffが生成できない問題へのワークアラウンドみたいなもので、次のいずれかが実現されれば不要になる

- AI 自体がコードの差分生成モデルを実装する
- 全文生成が気にならないぐらい、超高速に生成できるようになる

とはいえ、現時点ではコード生成の自動化のために必用なパーツのひとつなように思う。

今懸念してるのは、全文生成で遅くなってるが、自分でコードを生成すること自体がコード生成の品質に関与してるのでは？ということで、もしそうだとしたら差分だけの生成によってコードの生成能力が悪化することになる。これはもうしばらく試してみて確認する。

次にやること

- これを元にした cover-agent の自作
- codestral/claude-3-opus にモデルを入れ替えて比較