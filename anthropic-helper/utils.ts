import ts from 'npm:typescript@5.4.5';

export const createWriter = () => {
  const encoder = new TextEncoder();
  let current = '';
  let inTag = false;
  let tagName = '';
  return (delta: string) => {
    current += delta;
    while (true) {
      if (!inTag) {
        const tagStartIndex = current.indexOf('<');
        if (tagStartIndex !== -1) {
          const beforeTag = current.slice(0, tagStartIndex);
          Deno.stdout.writeSync(encoder.encode(beforeTag));
          current = current.slice(tagStartIndex);
          inTag = true;
        } else {
          Deno.stdout.writeSync(encoder.encode(current));
          current = '';
          break;
        }
      } else {
        const tagEndIndex = current.indexOf('>');
        if (tagEndIndex !== -1) {
          tagName = current.slice(1, tagEndIndex);
          const colorCode = getColorCodeForTag(tagName);
          const endTag = `</${tagName}>`;
          const endTagIndex = current.indexOf(endTag);
          if (endTagIndex !== -1) {
            const tagContent = current.slice(tagEndIndex + 1, endTagIndex);
            Deno.stdout.writeSync(encoder.encode(colorCode + '<' + tagName + '>' + tagContent + endTag + '\x1b[0m'));
            current = current.slice(endTagIndex + endTag.length);
            inTag = false;
            tagName = '';
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  };
};

const getColorCodeForTag = (tagName: string) => {
  switch (tagName) {
    case 'result':
      return '';
    case 'thinking':
      return '\x1b[34m';
    case 'info':
      return '\x1b[32m';
    case 'warning':
      return '\x1b[33m';
    case 'error':
      return '\x1b[31m';
    default:
      return '\x1b[34m';
  }
};


export type JSONSchema = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  properties?: {
    [key: string]: JSONSchema;
  };
  items?: JSONSchema;
  required?: readonly string[];
};

function stripCommentSyntax(comment: string): string {
  return comment.replace(/\/\*\*?/, '').replace(/\*\//, '')
    .replace(/\/\/\s?/, '').replace(/\n/g, '').replace(/\s+/g, ' ').trim();
}

function generateJsonSchema(node: ts.TypeNode): JSONSchema {
  const sourceFile = node.getSourceFile();
  if (ts.isTypeLiteralNode(node)) {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];
    node.members.forEach((member) => {
      if (ts.isPropertySignature(member)) {
        const propertyName = member.name.getText();
        const propertyType = generateJsonSchema(member.type!);
        const comment = getComemnt(member);
        properties[propertyName] = propertyType;
        if (comment) {
          properties[propertyName].description = comment;
        }
        if (!member.questionToken) {
          required.push(propertyName);
        }
      } else {
        throw new Error('Unsupported member');
      }
    });
    return {
      type: 'object',
      properties,
      required,
    };
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) {
    return { type: 'string' };
  } else if (node.kind === ts.SyntaxKind.NumberKeyword) {
    return { type: 'number' };
  } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.BooleanKeyword) {
    return { type: 'boolean' };
  }

  // Array
  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Array') {
    const itemType = generateJsonSchema(node.typeArguments?.[0]!);
    return { type: 'array', items: itemType };
  }
  if (ts.SyntaxKind.ArrayType === node.kind) {
    const newNode = node as ts.ArrayTypeNode;
    const itemType = generateJsonSchema(newNode.elementType);
    return { type: 'array', items: itemType };
  }
  throw new Error(`Unsupported type: ${ts.SyntaxKind[node.kind]} ${node.getText()}`);
}

function getComemnt(node: ts.Node) {
  const sourceFile = node.getSourceFile();
  const range = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!range) {
    return undefined;
  }
  let result = '';
  for (const comment of range || []) {
    result += sourceFile.text.slice(comment.pos, comment.end);
  }
  return stripCommentSyntax(result);
}

type ToolSchema = {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

export function getToolTypes(code: string): ToolSchema[] {
  const sourceFile = ts.createSourceFile('index.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const schemas: ToolSchema[] = [];
  sourceFile.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node)) {
      const isExported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExported) {
        return;
      }
      const comment = getComemnt(node);
      const schema = generateJsonSchema(node.parameters[0].type!);
      schemas.push({
        name: node.name!.getText(),
        description: comment || '',
        input_schema: schema,
      });
    }
  });
  return schemas;
}

if (import.meta.main) {
  const code = `
  // Get the degree
  export function get_degree(input: {
    /** The city and state, e.g. San Francisco, CA */
    location: string;
    // id
    id: number;
  
    foo: boolean;
  
    //xxx
    bar?: string;
  
    items: Array<{x: number}>
  
    xs: number[];
  
    nested: {
      depth: number
    }
  
  }): Promise<string> {
    return Promise.resolve('The degree is 15.');
  }
  
  function __priv() {}
  `;
  console.log(getToolTypes(code));
}