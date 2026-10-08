import { SignBlockEntityData, SignSide } from '../../domain/project.types';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import { fallbackMinecraftTextWidth, NORMAL_SIGN_TEXT_METRICS } from './sign-text-metrics';
import { isVanillaSignColor } from './sign-nbt';

export function isSignId(id: string): boolean {
  if (!id.startsWith('minecraft:')) return false;
  const path = id.slice('minecraft:'.length);
  return /(?:^|_)(?:wall_)?sign$/.test(path) || path.endsWith('_hanging_sign') || path.endsWith('_wall_hanging_sign');
}

export function isSignDefinition(definition: ReturnType<BlockLibraryService['get']>): boolean {
  return blockCapability(definition, 'block-entity')?.entityKind === 'sign';
}

export function defaultSignData(): SignBlockEntityData {
  const side: SignSide = { lines: ['', '', '', ''], color: 'black', glowing: false };
  return { kind: 'sign', front: side, back: { ...side, lines: [...side.lines] as SignSide['lines'] }, waxed: false };
}

export function signData(value: unknown): SignBlockEntityData {
  const raw = value && typeof value === 'object' ? value as Readonly<Record<string, unknown>> : undefined;
  if (!raw) return defaultSignData();
  const defaults = defaultSignData();
  return {
    ...defaults,
    ...raw,
    kind: 'sign',
    front: normalizeSignSide(raw['front'], defaults.front),
    back: normalizeSignSide(raw['back'], defaults.back),
    waxed: typeof raw['waxed'] === 'boolean' ? raw['waxed'] : defaults.waxed,
    ...((raw['kind'] === 'sign' || raw['raw']) ? {} : { raw }),
  };
}

function normalizeSignSide(value: unknown, fallback: SignSide): SignSide {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Readonly<Record<string, unknown>>;
  const lines = Array.isArray(source['lines']) ? signLines(source['lines'].filter((line): line is string => typeof line === 'string').join('\n')) : fallback.lines;
  const filteredMessages = Array.isArray(source['filteredMessages']) && source['filteredMessages'].length === 4 && source['filteredMessages'].every((line): line is string => typeof line === 'string')
    ? [source['filteredMessages'][0], source['filteredMessages'][1], source['filteredMessages'][2], source['filteredMessages'][3]] as SignSide['filteredMessages'] : fallback.filteredMessages;
  return {
    ...fallback,
    ...source,
    lines,
    filteredMessages,
    color: typeof source['color'] === 'string' && isVanillaSignColor(source['color']) ? source['color'] : fallback.color,
    glowing: typeof source['glowing'] === 'boolean' ? source['glowing'] : fallback.glowing,
  };
}

export function signLines(value: string): SignSide['lines'] {
  const values = value.replace(/\r\n?/g, '\n').split('\n').slice(0, 4);
  while (values.length < 4) values.push('');
  return [values[0] ?? '', values[1] ?? '', values[2] ?? '', values[3] ?? ''];
}

export function signLineWidth(value: string): number { return fallbackMinecraftTextWidth(value); }
export function fitsSignWidth(value: string): boolean { return signLineWidth(value) <= NORMAL_SIGN_TEXT_METRICS.maxWidth; }
