import { expect } from 'jsr:@std/expect@0.224.4';

interface CoverageData {
  filePath: string;
  functions: { [key: string]: { startLine: number, executionCount: number } };
  totalFunctions: number;
  hitFunctions: number;
  totalBranches: number;
  hitBranches: number;
  lines: { [key: number]: number };
  totalLines: number;
  hitLines: number;
}

export function parseLcov(lcovString: string): CoverageData {
  const lines = lcovString.split('\n');
  const coverageData: CoverageData = {
    filePath: '',
    functions: {},
    totalFunctions: 0,
    hitFunctions: 0,
    totalBranches: 0,
    hitBranches: 0,
    lines: {},
    totalLines: 0,
    hitLines: 0
  };

  for (const line of lines) {
    const [key, value] = line.split(':');
    if (!value) continue;

    switch (key) {
      case 'SF':
        coverageData.filePath = value;
        break;
      case 'FN':
        const [fnLine, fnName] = value.split(',');
        coverageData.functions[fnName] = { startLine: parseInt(fnLine, 10), executionCount: 0 };
        break;
      case 'FNDA':
        const [execCount, execFnName] = value.split(',');
        if (coverageData.functions[execFnName]) {
          coverageData.functions[execFnName].executionCount = parseInt(execCount, 10);
        }
        break;
      case 'FNF':
        coverageData.totalFunctions = parseInt(value, 10);
        break;
      case 'FNH':
        coverageData.hitFunctions = parseInt(value, 10);
        break;
      case 'BRF':
        coverageData.totalBranches = parseInt(value, 10);
        break;
      case 'BRH':
        coverageData.hitBranches = parseInt(value, 10);
        break;
      case 'DA':
        const [lineNumber, hitCount] = value.split(',');
        coverageData.lines[parseInt(lineNumber, 10)] = parseInt(hitCount, 10);
        break;
      case 'LH':
        coverageData.hitLines = parseInt(value, 10);
        break;
      case 'LF':
        coverageData.totalLines = parseInt(value, 10);
        break;
    }
  }
  return coverageData;
}

export function calculateCoverage(coverageData: CoverageData) {
  const functionCoverage = (coverageData.hitFunctions / coverageData.totalFunctions) * 100;
  const lineCoverage = (coverageData.hitLines / coverageData.totalLines) * 100;
  const branchCoverage = coverageData.totalBranches ? (coverageData.hitBranches / coverageData.totalBranches) * 100 : 100;

  return {
    functionCoverage,
    lineCoverage,
    branchCoverage
  };
}

Deno.test('parseLcov', () => {
  // Example usage
  const lcovData = `
SF:/input.ts
FN:1,add
FN:5,multiply
FNDA:2,add
FNDA:0,multiply
FNF:2
FNH:1
BRF:0
BRH:0
DA:1,2
DA:2,4
DA:3,4
DA:5,0
DA:6,0
DA:7,0
LH:3
LF:6
`.trim();


  const parsedData = parseLcov(lcovData);
  const coverage = calculateCoverage(parsedData);

  expect(parsedData.functions.add.executionCount).toBe(2);
  expect(parsedData).toEqual({
    filePath: "/input.ts",
    functions: {
      add: { startLine: 1, executionCount: 2 },
      multiply: { startLine: 5, executionCount: 0 }
    },
    totalFunctions: 2,
    hitFunctions: 1,
    totalBranches: 0,
    hitBranches: 0,
    lines: { "1": 2, "2": 4, "3": 4, "5": 0, "6": 0, "7": 0 },
    totalLines: 6,
    hitLines: 3
  });

  expect(coverage).toEqual({
    functionCoverage: 50,
    lineCoverage: 50,
    branchCoverage: 100
  });
});
