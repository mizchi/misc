import { runChat } from './openai.ts';
import prettier from "npm:prettier@2.4.1";
import ts from "npm:typescript@5.4.2";

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
    console.log(match[2]);
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
- AST を壊さないないでください。その行に意味的に対応するものは、必ず同じ行への出力としてください。入力に存在しない行への差分の出力は許可されません。
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
Original を参照しつつ、構文的に問題がないように Fixed に対して修正を試みてください。
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

const code1 = `
export function add(a: number, b: number): number {
  return 0;
}

export function sub(a: number, b: number): number {
  return 0;
}

export function mul(a: number, b: number): number {
  return 0;
}

export function div(a: number, b: number): number {
  return 0;
}
`;

const code2 = `
type Point = {
  x: number;
  y: number;
};

export function distance(a: Point, b: Point): number {
  throw new Error('Not implemented');
}
`;

const input = `
このファイルの各関数の実装を提供してください。
Deno.test を使用して、各関数が正しく実装されていることを確認するテストを追加してください。
`;

const code3 = `
export function add(a: number, b: number): number {
  throw new Error('Not implemented');
}
`;

const result = await fixCode(input, code3);
if (!result.ok) {
  console.error(result.error);
  Deno.exit(1);
}
console.log('== fixed code ==');
console.log(result.code);