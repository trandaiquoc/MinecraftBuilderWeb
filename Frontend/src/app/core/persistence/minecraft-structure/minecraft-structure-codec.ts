import type { MinecraftNbtRoot, MinecraftStructureTemplate } from './minecraft-structure-types';

/** Binary codec port; the UI and ProjectDocument never depend on a package implementation. */
export interface MinecraftJavaNbtCodec {
  readonly name: string;
  readonly supportsGzip: boolean;
  decode(bytes: Uint8Array): Promise<MinecraftNbtRoot>;
  encode(root: MinecraftNbtRoot): Promise<Uint8Array>;
}

export interface MinecraftStructureAdapter {
  decodeStructure(root: MinecraftNbtRoot): MinecraftStructureTemplate;
  encodeStructure(template: MinecraftStructureTemplate): MinecraftNbtRoot;
}
