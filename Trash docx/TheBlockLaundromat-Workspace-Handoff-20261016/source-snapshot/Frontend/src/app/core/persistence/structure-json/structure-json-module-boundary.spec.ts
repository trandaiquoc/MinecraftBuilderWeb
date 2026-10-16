// @ts-expect-error Vitest executes the filesystem contract in Node.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error Vitest executes the filesystem contract in Node.
import * as path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const structureJsonDirectory = path.resolve('src/app/core/persistence/structure-json');
const publicEntryPoint = path.join(structureJsonDirectory, 'structure-json.ts');

describe('Structure JSON module boundaries', () => {
  it('keeps internal implementation modules off the public compatibility entry point', () => {
    const consumers: string[] = [];

    for (const file of sourceFiles(structureJsonDirectory)) {
      if (file === publicEntryPoint || file.endsWith('.spec.ts')) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );

      const checkModuleSpecifier = (specifier: string): void => {
        if (!specifier.startsWith('.')) return;
        const resolved = resolveTypeScriptModule(file, specifier);
        if (resolved === publicEntryPoint)
          consumers.push(path.relative(structureJsonDirectory, file));
      };

      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          checkModuleSpecifier(node.moduleSpecifier.text);
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          checkModuleSpecifier(node.arguments[0].text);
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          checkModuleSpecifier(node.argument.literal.text);
        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(consumers).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true }) as {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }[];
  return entries.flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : entry.isFile() && file.endsWith('.ts')
        ? [file]
        : [];
  });
}

function resolveTypeScriptModule(sourceFile: string, specifier: string): string | undefined {
  const target = path.resolve(path.dirname(sourceFile), specifier);
  for (const candidate of [`${target}.ts`, path.join(target, 'index.ts')]) {
    if (candidate === publicEntryPoint) return candidate;
  }
  return undefined;
}
