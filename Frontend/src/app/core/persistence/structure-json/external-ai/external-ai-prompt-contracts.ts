import type { ExternalAiContentLimits } from './external-ai-content-limits';

export type ExternalAiPromptLocale = 'en' | 'vi';
export interface ExternalAiItemContext {
  readonly id: string;
  readonly maxStackSize?: number;
}
export interface ExternalAiDecorationContext {
  readonly id: string;
  readonly kind: string;
}
export interface ExternalAiModContext {
  readonly sourceId: string;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly loader: string;
  readonly namespaces: readonly string[];
  readonly sourceUrls?: readonly string[];
  readonly blocks: readonly string[];
  readonly items: readonly ExternalAiItemContext[];
  readonly decorations: readonly ExternalAiDecorationContext[];
}
export interface ExternalAiProjectSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface ExternalAiProjectContext {
  readonly currentSize: ExternalAiProjectSize;
  readonly resizeSupported: boolean;
  readonly maximumSize: ExternalAiProjectSize;
  readonly vanillaStructureBlockLimit: number;
}
export interface ExternalAiPromptContext {
  readonly minecraftVersion: string;
  readonly vanillaSource: string;
  readonly projectContext: ExternalAiProjectContext;
  readonly mods: readonly ExternalAiModContext[];
}
export type ExternalAiModContentCategory = 'blocks' | 'items' | 'decorations';
export interface ExternalAiModContentSelection {
  readonly sourceId: string;
  readonly includeBlocks: boolean;
  readonly includeItems: boolean;
  readonly includeDecorations: boolean;
}
export interface ExternalAiPromptOptions {
  readonly locale?: ExternalAiPromptLocale;
  readonly includeGuidance?: boolean;
  readonly includeAvailableContent?: boolean;
  readonly includeExample?: boolean;
  readonly modSelections?: readonly ExternalAiModContentSelection[];
  readonly contentLimits?: ExternalAiContentLimits;
  readonly contentLimitsEnabled?: boolean;
}
export interface ExternalAiContentSelection {
  readonly includeAvailableContent?: boolean;
  readonly modSelections?: readonly ExternalAiModContentSelection[];
}
export interface ExternalAiSelectedTotals {
  readonly mods: number;
  readonly blocks: number;
  readonly items: number;
  readonly decorations: number;
}
