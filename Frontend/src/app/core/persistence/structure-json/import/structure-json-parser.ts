/** Structural JSON parsing, including the narrow legacy v2 migration. */

import type { DecorationFacing } from '../../../decorations/decoration.types';
import { isValidNamespacedResourceLocation } from '../../../content/resource-location';
import { LEGACY_STRUCTURE_JSON_VERSION, STRUCTURE_JSON_FORMAT } from '../structure-json-contracts';
import type {
  ParsedStructureJsonResult,
  StructureJsonBlock,
  StructureJsonBlockEntity,
  StructureJsonContainerItem,
  StructureJsonDecoration,
  StructureJsonItem,
  StructureJsonPainting,
  StructureJsonPot,
  StructureJsonSignSide,
  StructureJsonValidationResult,
} from '../structure-json-contracts';

const topLevelKeys = new Set(['format', 'minecraftVersion', 'name', 'blocks', 'decorations']);

const legacyTopLevelKeys = new Set([...topLevelKeys, 'formatVersion']);

const blockKeys = new Set(['id', 'x', 'y', 'z', 'state', 'blockEntity']);

const paintingKeys = new Set(['kind', 'anchor', 'facing', 'variantId']);

const frameKeys = new Set([
  'kind',
  'anchor',
  'facing',
  'item',
  'rotation',
  'invisible',
  'fixed',
  'itemDropChance',
]);

const anchorKeys = new Set(['x', 'y', 'z']);

const itemKeys = new Set(['id', 'count', 'components']);

const containerKeys = new Set(['kind', 'items']);

const containerItemKeys = new Set(['slot', 'item']);

const potKeys = new Set(['kind', 'decorations', 'item']);

const potDecorationKeys = new Set(['back', 'left', 'right', 'front']);

const signKeys = new Set(['kind', 'front', 'back', 'waxed']);

const signSideKeys = new Set(['lines', 'color', 'glowing', 'filteredMessages']);

const stateKey = /^[a-z0-9_.-]+$/;

const facings = new Set<DecorationFacing>(['down', 'up', 'north', 'south', 'west', 'east']);

const wallFacings = new Set(['north', 'south', 'east', 'west']);

export function parseStructureJson(serialized: string): ParsedStructureJsonResult {
  const raw = parseRaw(serialized);
  if (!raw.ok) return raw.result;
  if (raw.value['format'] !== STRUCTURE_JSON_FORMAT) return { valid: false, code: 'format' };
  const legacy = raw.value['formatVersion'] !== undefined;
  if (legacy && raw.value['formatVersion'] !== LEGACY_STRUCTURE_JSON_VERSION)
    return { valid: false, code: 'version' };
  return parseValue(raw.value, legacy);
}

function parseValue(value: Record<string, unknown>, legacy: boolean): ParsedStructureJsonResult {
  const allowed = legacy ? legacyTopLevelKeys : topLevelKeys;
  if (!hasOnlyKeys(value, allowed) || value['format'] !== STRUCTURE_JSON_FORMAT)
    return { valid: false, code: 'shape' };
  const common = validateCommonTopLevel(value);
  if (!common.valid) return common;
  const blocks = parseBlocks(value['blocks']);
  if (!isValid(blocks)) return blocks;
  if (!Array.isArray(value['decorations'])) return { valid: false, code: 'decorations' };
  const decorations: StructureJsonDecoration[] = [];
  for (let index = 0; index < value['decorations'].length; index += 1) {
    const parsed = parseDecoration(value['decorations'][index]);
    if (!isValid(parsed))
      return {
        valid: false,
        code: 'decoration',
        path: `decorations[${index}]${parsed.path ? `.${parsed.path}` : ''}`,
      };
    decorations.push(parsed.value);
  }
  return {
    valid: true,
    value: {
      format: STRUCTURE_JSON_FORMAT,
      minecraftVersion: value['minecraftVersion'] as string,
      ...(value['name'] === undefined ? {} : { name: value['name'] as string }),
      blocks: blocks.value,
      decorations,
    },
  };
}

function parseRaw(
  serialized: string,
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly result: ParsedStructureJsonResult } {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, result: { valid: false, code: 'invalid-json' } };
  }
  return isRecord(value)
    ? { ok: true, value }
    : { ok: false, result: { valid: false, code: 'shape' } };
}

function validateCommonTopLevel(value: Record<string, unknown>): StructureJsonValidationResult {
  if (typeof value['minecraftVersion'] !== 'string' || value['minecraftVersion'].length === 0)
    return { valid: false, code: 'minecraft-version' };
  if (value['name'] !== undefined && typeof value['name'] !== 'string')
    return { valid: false, code: 'shape' };
  return { valid: true };
}

function parseBlocks(
  raw: unknown,
): { readonly valid: true; readonly value: StructureJsonBlock[] } | StructureJsonValidationResult {
  if (!Array.isArray(raw)) return { valid: false, code: 'blocks' };
  const blocks: StructureJsonBlock[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const block = raw[index];
    if (
      !isRecord(block) ||
      !hasOnlyKeys(block, blockKeys) ||
      typeof block['id'] !== 'string' ||
      !isValidNamespacedResourceLocation(block['id']) ||
      !Number.isInteger(block['x']) ||
      !Number.isInteger(block['y']) ||
      !Number.isInteger(block['z'])
    )
      return { valid: false, code: 'block', path: `blocks[${index}]` };
    if (
      block['state'] !== undefined &&
      (!isRecord(block['state']) ||
        Object.entries(block['state']).some(
          ([key, stateValue]) => !stateKey.test(key) || typeof stateValue !== 'string',
        ))
    )
      return { valid: false, code: 'block', path: `blocks[${index}].state` };
    let blockEntity: StructureJsonBlockEntity | undefined;
    if (block['blockEntity'] !== undefined) {
      const parsed = parseBlockEntity(block['blockEntity']);
      if (!isValid(parsed))
        return {
          valid: false,
          code: 'block-entity',
          path: `blocks[${index}].blockEntity${parsed.path ? `.${parsed.path}` : ''}`,
        };
      blockEntity = parsed.value;
    }
    blocks.push({
      id: block['id'] as string,
      x: block['x'] as number,
      y: block['y'] as number,
      z: block['z'] as number,
      ...(block['state'] === undefined
        ? {}
        : { state: block['state'] as Readonly<Record<string, string>> }),
      ...(blockEntity ? { blockEntity } : {}),
    });
  }
  return { valid: true, value: blocks };
}

function parseBlockEntity(
  raw: unknown,
):
  | { readonly valid: true; readonly value: StructureJsonBlockEntity }
  | StructureJsonValidationResult {
  if (!isRecord(raw) || typeof raw['kind'] !== 'string')
    return { valid: false, code: 'block-entity' };
  if (raw['kind'] === 'container') {
    if (!hasOnlyKeys(raw, containerKeys) || !Array.isArray(raw['items']))
      return { valid: false, code: 'block-entity' };
    const seen = new Set<number>();
    const items: StructureJsonContainerItem[] = [];
    for (let index = 0; index < raw['items'].length; index += 1) {
      const entry = raw['items'][index];
      if (
        !isRecord(entry) ||
        !hasOnlyKeys(entry, containerItemKeys) ||
        !Number.isInteger(entry['slot']) ||
        (entry['slot'] as number) < 0 ||
        seen.has(entry['slot'] as number)
      )
        return { valid: false, code: 'block-entity', path: `items[${index}].slot` };
      const item = parseItem(entry['item']);
      if (!isValid(item))
        return { valid: false, code: 'block-entity', path: `items[${index}].item` };
      seen.add(entry['slot'] as number);
      items.push({ slot: entry['slot'] as number, item: item.value });
    }
    return { valid: true, value: { kind: 'container', items } };
  }
  if (raw['kind'] === 'decorated-pot') {
    const decorations = raw['decorations'];
    if (
      !hasOnlyKeys(raw, potKeys) ||
      !isRecord(decorations) ||
      !hasOnlyKeys(decorations, potDecorationKeys) ||
      !['back', 'left', 'right', 'front'].every(
        (key) =>
          typeof decorations[key] === 'string' &&
          isValidNamespacedResourceLocation(decorations[key] as string),
      )
    )
      return { valid: false, code: 'block-entity' };
    const item = raw['item'] === undefined ? undefined : parseItem(raw['item']);
    if (item && !isValid(item)) return { valid: false, code: 'block-entity', path: 'item' };
    return {
      valid: true,
      value: {
        kind: 'decorated-pot',
        decorations: decorations as StructureJsonPot['decorations'],
        ...(item ? { item: item.value } : {}),
      },
    };
  }
  if (raw['kind'] === 'sign') {
    if (!hasOnlyKeys(raw, signKeys) || typeof raw['waxed'] !== 'boolean')
      return { valid: false, code: 'block-entity' };
    const front = parseSignSide(raw['front']);
    const back = parseSignSide(raw['back']);
    if (!isValid(front) || !isValid(back)) return { valid: false, code: 'block-entity' };
    return {
      valid: true,
      value: { kind: 'sign', front: front.value, back: back.value, waxed: raw['waxed'] },
    };
  }
  return { valid: false, code: 'block-entity' };
}

function parseSignSide(
  raw: unknown,
): { readonly valid: true; readonly value: StructureJsonSignSide } | StructureJsonValidationResult {
  if (
    !isRecord(raw) ||
    !hasOnlyKeys(raw, signSideKeys) ||
    !Array.isArray(raw['lines']) ||
    raw['lines'].length !== 4 ||
    !raw['lines'].every((line) => typeof line === 'string') ||
    typeof raw['color'] !== 'string' ||
    typeof raw['glowing'] !== 'boolean'
  )
    return { valid: false, code: 'block-entity' };
  const filtered = raw['filteredMessages'];
  if (
    filtered !== undefined &&
    (!Array.isArray(filtered) ||
      filtered.length !== 4 ||
      !filtered.every((line) => typeof line === 'string'))
  )
    return { valid: false, code: 'block-entity' };
  return {
    valid: true,
    value: {
      lines: raw['lines'] as unknown as StructureJsonSignSide['lines'],
      color: raw['color'],
      glowing: raw['glowing'],
      ...(filtered === undefined
        ? {}
        : { filteredMessages: filtered as unknown as StructureJsonSignSide['filteredMessages'] }),
    },
  };
}

function parseItem(
  raw: unknown,
): { readonly valid: true; readonly value: StructureJsonItem } | StructureJsonValidationResult {
  if (
    !isRecord(raw) ||
    !hasOnlyKeys(raw, itemKeys) ||
    typeof raw['id'] !== 'string' ||
    !isValidNamespacedResourceLocation(raw['id']) ||
    (raw['components'] !== undefined && !isRecord(raw['components']))
  )
    return { valid: false, code: 'block-entity' };
  const count = raw['count'];
  if (count !== undefined && (!Number.isInteger(count) || (count as number) <= 0))
    return { valid: false, code: 'block-entity' };
  return {
    valid: true,
    value: {
      id: raw['id'],
      ...(count === undefined ? {} : { count: count as number }),
      ...(raw['components'] === undefined
        ? {}
        : { components: raw['components'] as Readonly<Record<string, unknown>> }),
    },
  };
}

function parseDecoration(
  raw: unknown,
):
  | { readonly valid: true; readonly value: StructureJsonDecoration }
  | StructureJsonValidationResult {
  if (
    !isRecord(raw) ||
    typeof raw['kind'] !== 'string' ||
    !isRecord(raw['anchor']) ||
    !hasOnlyKeys(raw['anchor'], anchorKeys) ||
    !Number.isInteger(raw['anchor']['x']) ||
    !Number.isInteger(raw['anchor']['y']) ||
    !Number.isInteger(raw['anchor']['z']) ||
    typeof raw['facing'] !== 'string' ||
    !facings.has(raw['facing'] as DecorationFacing)
  )
    return { valid: false, code: 'decoration' };
  const anchor = {
    x: raw['anchor']['x'] as number,
    y: raw['anchor']['y'] as number,
    z: raw['anchor']['z'] as number,
  };
  if (raw['kind'] === 'painting') {
    if (
      !hasOnlyKeys(raw, paintingKeys) ||
      !wallFacings.has(raw['facing']) ||
      typeof raw['variantId'] !== 'string' ||
      !raw['variantId'].trim()
    )
      return { valid: false, code: 'decoration' };
    return {
      valid: true,
      value: {
        kind: 'painting',
        anchor,
        facing: raw['facing'] as StructureJsonPainting['facing'],
        variantId: raw['variantId'],
      },
    };
  }
  if (raw['kind'] !== 'item-frame' && raw['kind'] !== 'glow-item-frame')
    return { valid: false, code: 'decoration' };
  const rotation = raw['rotation'];
  const invisible = raw['invisible'];
  const fixed = raw['fixed'];
  const itemDropChance = raw['itemDropChance'];
  if (
    !hasOnlyKeys(raw, frameKeys) ||
    (rotation !== undefined &&
      (!Number.isInteger(rotation) || (rotation as number) < 0 || (rotation as number) > 7)) ||
    (invisible !== undefined && typeof invisible !== 'boolean') ||
    (fixed !== undefined && typeof fixed !== 'boolean') ||
    (itemDropChance !== undefined &&
      (typeof itemDropChance !== 'number' ||
        !Number.isFinite(itemDropChance) ||
        itemDropChance < 0 ||
        itemDropChance > 1))
  )
    return { valid: false, code: 'decoration' };
  if (raw['item'] !== undefined) {
    const item = parseItem(raw['item']);
    if (!isValid(item)) return { valid: false, code: 'decoration', path: 'item' };
    return {
      valid: true,
      value: {
        kind: raw['kind'],
        anchor,
        facing: raw['facing'] as DecorationFacing,
        item: item.value,
        ...(rotation === undefined ? {} : { rotation: rotation as number }),
        ...(invisible === undefined ? {} : { invisible: invisible as boolean }),
        ...(fixed === undefined ? {} : { fixed: fixed as boolean }),
        ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }),
      },
    };
  }
  return {
    valid: true,
    value: {
      kind: raw['kind'],
      anchor,
      facing: raw['facing'] as DecorationFacing,
      ...(rotation === undefined ? {} : { rotation: rotation as number }),
      ...(invisible === undefined ? {} : { invisible: invisible as boolean }),
      ...(fixed === undefined ? {} : { fixed: fixed as boolean }),
      ...(itemDropChance === undefined ? {} : { itemDropChance: itemDropChance as number }),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValid<T>(value: {
  readonly valid: boolean;
  readonly value?: T;
}): value is { readonly valid: true; readonly value: T } {
  return value.valid === true && value.value !== undefined;
}
