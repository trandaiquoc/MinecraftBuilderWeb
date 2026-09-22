import type { ContentIntrospectionDiagnostic, ContentSemanticSupplement, ContentSemanticEvidenceProvider } from './content-introspection';

/** Version-specific names belong here, at the format boundary.  The current
 * profile intentionally contains no mod/content names and proves no runtime
 * semantics until a structural contract is implemented. */
export interface JvmMinecraftSymbolProfile {
  readonly minecraftVersion: string;
  readonly classFileMajor: number;
}

export interface JvmClassStructure {
  readonly majorVersion: number;
  readonly constantPoolCount: number;
  readonly fields: readonly { readonly descriptor: string }[];
  readonly methods: readonly { readonly descriptor: string }[];
}

export interface JvmEvidenceResult {
  readonly structure?: JvmClassStructure;
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
}

/** Read-only class-file parser. It never loads or executes bytecode. Unknown
 * structures fail closed and remain available as static resources. */
export function inspectJvmClass(bytes: Uint8Array, resource = '<class>'): JvmEvidenceResult {
  try {
    const reader = new ClassReader(bytes); if (reader.u4() !== 0xcafebabe) return malformed(resource, 'Invalid JVM class magic.');
    reader.u2(); const majorVersion = reader.u2(); const constantPoolCount = reader.u2();
    const pool: (string | undefined)[] = Array(constantPoolCount);
    for (let index = 1; index < constantPoolCount; index++) {
      const tag = reader.u1();
      if (tag === 1) pool[index] = reader.utf8();
      else if ([3, 4].includes(tag)) reader.skip(4);
      else if ([5, 6].includes(tag)) { reader.skip(8); index++; }
      else if ([7, 8, 16, 19, 20].includes(tag)) reader.skip(2);
      else if ([9, 10, 11, 12, 17, 18].includes(tag)) reader.skip(4);
      else if (tag === 15) reader.skip(3);
      else return malformed(resource, `Unsupported JVM constant-pool tag ${tag}.`);
    }
    reader.skip(6); const interfaces = reader.u2(); reader.skip(2 * interfaces);
    const fields = readMembers(reader, pool); const methods = readMembers(reader, pool);
    return { structure: { majorVersion, constantPoolCount, fields, methods }, diagnostics: [] };
  } catch (error) { return malformed(resource, error instanceof Error ? error.message : 'Malformed JVM class file.'); }
}

/** A fail-closed semantic provider. Structural contracts can be added here
 * behind a symbol profile without coupling content logic to Java names. */
export class StaticJvmSemanticEvidenceProvider implements ContentSemanticEvidenceProvider {
  readonly diagnostics: readonly ContentIntrospectionDiagnostic[];
  private readonly supplements = new Map<string, readonly ContentSemanticSupplement[]>();
  constructor(private readonly profile: JvmMinecraftSymbolProfile, classes: ReadonlyMap<string, Uint8Array> = new Map()) {
    const diagnostics: ContentIntrospectionDiagnostic[] = [];
    for (const [path, bytes] of classes) {
      const result = inspectJvmClass(bytes, path);
      diagnostics.push(...result.diagnostics.map((diagnostic) => ({ ...diagnostic, sourceId: profile.minecraftVersion })));
      // No supplement is emitted unless a future structural contract proves
      // both storage and display semantics. Absence of proof is not failure.
    }
    this.diagnostics = diagnostics;
  }
  supplementsFor(_contentId: string, _sourceId?: string): readonly ContentSemanticSupplement[] { return this.supplements.get(_contentId) ?? []; }
}

function readMembers(reader: ClassReader, pool: readonly (string | undefined)[]): readonly { readonly descriptor: string }[] {
  const count = reader.u2(); const result: { descriptor: string }[] = [];
  for (let index = 0; index < count; index++) { reader.skip(4); const name = pool[reader.u2()]; const descriptor = pool[reader.u2()]; if (name && descriptor) result.push({ descriptor }); skipAttributes(reader); }
  return result;
}
function skipAttributes(reader: ClassReader): void { for (let index = 0, count = reader.u2(); index < count; index++) { reader.skip(2); reader.skip(4); reader.skip(reader.u4()); } }
function malformed(resource: string, message: string): JvmEvidenceResult { return { diagnostics: [{ code: 'unsupported-resource-format', message, resource }] }; }

class ClassReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  u1(): number { this.ensure(1); return this.bytes[this.offset++]; }
  u2(): number { return (this.u1() << 8) | this.u1(); }
  u4(): number { return (this.u2() * 0x10000) + this.u2(); }
  utf8(): string { const length = this.u2(); this.ensure(length); const value = new TextDecoder().decode(this.bytes.slice(this.offset, this.offset + length)); this.offset += length; return value; }
  skip(length: number): void { this.ensure(length); this.offset += length; }
  private ensure(length: number): void { if (length < 0 || this.offset + length > this.bytes.length) throw new Error('Truncated JVM class file.'); }
}
