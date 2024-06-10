interface Diff {
  lineNumber: number;
  content: string;
}

function applyDiffs(source: string, diffs: Diff[]): string {
  const lines = source.split('\n').map((content, index) => ({ lineNumber: index + 1, content }));
  const modifiedLinesMap: { [key: number]: number } = {};

  diffs.forEach(diff => {
    const originalLineIndex = diff.lineNumber - 1;

    if (modifiedLinesMap[originalLineIndex] !== undefined) {
      // 既に書き換え済みの行がある場合、その行の次に新しい行を追加する
      const insertIndex = modifiedLinesMap[originalLineIndex];
      lines.splice(insertIndex + 1, 0, { lineNumber: 0, content: diff.content });
      // 最後に追加した行の位置を記録
      modifiedLinesMap[originalLineIndex] = insertIndex + 1;
    } else {
      // 初回の書き換えの場合、既存の行を書き換える
      lines[originalLineIndex].content = diff.content;
      // その行が書き換えられたことを記録
      modifiedLinesMap[originalLineIndex] = originalLineIndex;
    }
  });

  // 行番号を除去してソースコードを再構築
  return lines.map(line => line.content).join('\n');
}

const sourceCode = `
\`\`\`ts
 1: 
 2: export function add(a: number, b: number): number {
 3:   return 0;
 4: }
 5: 
 6: export function sub(a: number, b: number): number {
 7:   return 0;
 8: }
 9: 
10: export function mul(a: number, b: number): number {
11:   return 0;
12: }
13: 
14: export function div(a: number, b: number): number {
15:   return 0;
16: }
17: 
\`\`\`
`;

// Example diffs including same line modifications
const diffs: Diff[] = [
  { lineNumber: 3, content: '  return a + b;' },
  { lineNumber: 3, content: '  // This is a comment' },
  { lineNumber: 7, content: '  return a - b;' },
  { lineNumber: 11, content: '  return a * b;' },
  { lineNumber: 15, content: '  if (b === 0) {' },
  { lineNumber: 16, content: '    throw new Error(\'Division by zero\');' },
  { lineNumber: 17, content: '  }' },
  { lineNumber: 18, content: '  return a / b;' }
];

// Apply diffs to the source code
const updatedSourceCode = applyDiffs(sourceCode, diffs);

console.log('Updated Source Code:\n', updatedSourceCode);
