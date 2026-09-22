import { BlockSupportLevel } from '../catalog/block-definition.types';
import { BlockState } from '../../domain/project.types';
import { resolveResourceLocation, resourcePath } from '../../content/resource-location';
import { variantKeyMatches, normalizePredicate, predicateMatches } from '../../content/normalized-predicate';
import { AssetResourceProvider, BlockStateRotationResult, MemoryAssetResourceProvider, ResolvedBlockModel, ResolvedElement, ResolvedElementRotation, ResolvedFace, ResolvedModelPart, ResolverDiagnostic, ResolverDiagnosticCode, ResolverStateDefinitions } from './resolver.types';

interface ModelDocument { parent?: unknown; textures?: unknown; elements?: unknown; ambientocclusion?: unknown; }
interface BlockStateDocument { variants?: unknown; multipart?: unknown; }
interface ConfiguredModel { model: string; x?: number; y?: number; z?: number; uvlock?: boolean; weight?: number; }

export class BlockModelResolver {
  constructor(private readonly provider: AssetResourceProvider) {}

  resolve(blockId: string, state: BlockState = {}, seed = ''): ResolvedBlockModel {
    const diagnostics: ResolverDiagnostic[] = [];
    const blockPath = blockstatePath(blockId);
    const matchedVariantKeys: string[] = [];
    const modelResources = new Set<string>();
    const parentResources = new Set<string>();
    const document = this.provider.readJson(blockPath);
    if (!isRecord(document)) return result(blockId, state, [], 'fallback', diagnostic('missing-blockstate', `Missing blockstate resource: ${blockPath}`, blockPath));
    const selected = selectConfiguredModels(document, state, seed, diagnostics, matchedVariantKeys);
    if (!selected.length) return result(blockId, state, [], 'fallback', ...diagnostics);
    const parts: ResolvedModelPart[] = [];
    for (const configured of selected) {
      const model = this.resolveModel(configured.model, diagnostics, new Set(), modelResources, parentResources);
      if (!model) continue;
      const textureMap = resolveTextures(model.textures, diagnostics, configured.model);
      parts.push({ model: configured.model, weight: configured.weight ?? 1, transform: { x: configured.x ?? 0, y: configured.y ?? 0, ...(configured.z ? { z: configured.z } : {}), uvlock: configured.uvlock ?? false }, elements: parseElements(model.elements, textureMap.values, textureMap.hints, diagnostics, configured.model), textures: textureMap.values, ambientOcclusion: typeof model.ambientocclusion === 'boolean' ? model.ambientocclusion : undefined });
    }
    const support: BlockSupportLevel = parts.length && !diagnostics.some((item) => item.code === 'missing-parent' || item.code === 'parent-cycle' || item.code === 'missing-model' || item.code === 'missing-texture' || item.code === 'malformed-model' || item.code === 'unsupported-model-behavior') ? 'full' : parts.length ? 'partial' : 'fallback';
    return { blockId, state: { ...state }, parts, support, diagnostics, trace: resolverTrace(blockPath, matchedVariantKeys, selected, modelResources, parentResources, parts) };
  }

  rotateState(state: BlockState, definitions: ResolverStateDefinitions, quarterTurns: number): BlockStateRotationResult {
    const turns = ((quarterTurns % 4) + 4) % 4;
    if (!turns) return { state: { ...state }, supported: true, diagnostics: [] };
    const facing = definitions.find((definition) => definition.name === 'facing' && ['north', 'east', 'south', 'west'].every((value) => definition.values.includes(value)));
    if (facing && state['facing']) {
      const values = ['north', 'east', 'south', 'west'];
      const index = values.indexOf(state['facing']);
      if (index >= 0) return { state: { ...state, facing: values[(index + turns) % 4] }, supported: true, diagnostics: [] };
    }
    const axis = definitions.find((definition) => definition.name === 'axis' && ['x', 'y', 'z'].every((value) => definition.values.includes(value)));
    if (axis && state['axis'] && turns % 2 === 1 && (state['axis'] === 'x' || state['axis'] === 'z')) return { state: { ...state, axis: state['axis'] === 'x' ? 'z' : 'x' }, supported: true, diagnostics: [] };
    return { supported: false, diagnostics: [diagnostic('unsupported-model-behavior', 'BlockState rotation is not supported for the supplied properties.')] };
  }

  private resolveModel(model: string, diagnostics: ResolverDiagnostic[], chain: Set<string>, modelResources: Set<string>, parentResources: Set<string>): ModelDocument | undefined {
    const path = modelPath(model);
    modelResources.add(path);
    if (chain.has(path)) { diagnostics.push(diagnostic('parent-cycle', `Circular model parent detected at ${model}`, path)); return undefined; }
    const raw = this.provider.readJson(path);
    if (!isRecord(raw)) { diagnostics.push(diagnostic('missing-model', `Missing model resource: ${path}`, path)); return undefined; }
    if (raw['parent'] !== undefined && typeof raw['parent'] !== 'string') { diagnostics.push(diagnostic('malformed-model', `Invalid parent in model: ${path}`, path)); return undefined; }
    const current = raw as ModelDocument;
    const parentId = typeof current.parent === 'string' ? current.parent : undefined;
    if (!parentId) return current;
    const parentResource = modelPath(resolveResourceLocation(parentId) ?? parentId);
    parentResources.add(parentResource);
    const parent = this.resolveModel(resolveResourceLocation(parentId) ?? parentId, diagnostics, new Set([...chain, path]), modelResources, parentResources);
    if (!parent) { diagnostics.push(diagnostic('missing-parent', `Missing model parent: ${parentId}`, path)); return current; }
    return { ...parent, ...current, textures: { ...(isRecord(parent.textures) ? parent.textures : {}), ...(isRecord(current.textures) ? current.textures : {}) }, elements: current.elements ?? parent.elements, ambientocclusion: current.ambientocclusion ?? parent.ambientocclusion };
  }
}

export function createResolver(resources: Readonly<Record<string, unknown>>): BlockModelResolver { return new BlockModelResolver(new MemoryAssetResourceProvider(resources)); }

function selectConfiguredModels(document: BlockStateDocument, state: BlockState, seed: string, diagnostics: ResolverDiagnostic[], matchedVariantKeys: string[]): ConfiguredModel[] {
  const output: ConfiguredModel[] = [];
  if (document['variants'] === undefined && document['multipart'] === undefined) diagnostics.push(diagnostic('malformed-blockstate', 'Blockstate must define variants or multipart.'));
  if (isRecord(document['variants'])) {
    const candidates = Object.entries(document['variants']).filter(([key]) => variantMatches(key, state)).sort((a, b) => specificity(b[0]) - specificity(a[0]));
    if (candidates.length) { matchedVariantKeys.push(candidates[0][0]); output.push(...configuredModels(candidates[0][1], seed, diagnostics)); }
    else diagnostics.push(diagnostic('no-matching-variant', 'No blockstate variant matches the supplied BlockState.'));
  } else if (document['variants'] !== undefined) diagnostics.push(diagnostic('malformed-blockstate', 'Blockstate variants must be an object.'));
  if (Array.isArray(document['multipart'])) {
    for (const part of document['multipart']) if (isRecord(part) && multipartMatches(part['when'], state)) output.push(...configuredModels(part['apply'], seed, diagnostics));
  } else if (document['multipart'] !== undefined) diagnostics.push(diagnostic('malformed-blockstate', 'Blockstate multipart must be an array.'));
  return output;
}

function configuredModels(value: unknown, seed: string, diagnostics: ResolverDiagnostic[]): ConfiguredModel[] {
  const list = Array.isArray(value) ? value.filter(isRecord) : [value].filter(isRecord);
  if (!list.length) { diagnostics.push(diagnostic('malformed-blockstate', 'Configured blockstate model is not an object.')); return []; }
  const models = list.filter((item) => typeof item['model'] === 'string').map((item) => ({ model: item['model'] as string, x: numberOrUndefined(item['x']), y: numberOrUndefined(item['y']), z: numberOrUndefined(item['z']), uvlock: typeof item['uvlock'] === 'boolean' ? item['uvlock'] : undefined, weight: typeof item['weight'] === 'number' && item['weight'] > 0 ? item['weight'] : 1 }));
  if (!models.length) diagnostics.push(diagnostic('malformed-blockstate', 'Configured blockstate model is missing a model reference.'));
  if (models.length <= 1) return models;
  const total = models.reduce((sum, model) => sum + (model.weight ?? 1), 0);
  let cursor = stableHash(seed + models.map((model) => model.model).join('|')) % total;
  for (const model of models) { cursor -= model.weight ?? 1; if (cursor < 0) return [model]; }
  return [models[models.length - 1]];
}

function variantMatches(key: string, state: BlockState): boolean {
  return variantKeyMatches(key, state);
}

function multipartMatches(value: unknown, state: BlockState): boolean {
  if (value === undefined) return true;
  return isRecord(value) && predicateMatches(normalizePredicate(value), state);
}

function parseElements(value: unknown, textures: Readonly<Record<string, string>>, textureHints: Readonly<Record<string, boolean>>, diagnostics: ResolverDiagnostic[], resource: string): ResolvedElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    const from = tuple(item['from'], 3); const to = tuple(item['to'], 3);
    if (!from || !to || !isRecord(item['faces'])) { diagnostics.push(diagnostic('malformed-model', `Invalid element in model: ${resource}`, resource)); return []; }
    const rotation = parseRotation(item['rotation']);
    const faces: Record<string, ResolvedFace> = {};
    for (const [direction, rawFace] of Object.entries(item['faces'])) {
      if (!isRecord(rawFace) || typeof rawFace['texture'] !== 'string') { diagnostics.push(diagnostic('malformed-model', `Invalid face in model: ${resource}`, resource)); continue; }
      const texture = resolveTextureReference(rawFace['texture'], textures, diagnostics, resource);
      faces[direction] = { texture, ...(textureHints[texture] === true ? { forceTranslucent: true } : {}), uv: tuple4(rawFace['uv']) ?? defaultFaceUv(direction, from, to), rotation: numberOrUndefined(rawFace['rotation']), cullface: typeof rawFace['cullface'] === 'string' ? rawFace['cullface'] : undefined, tintindex: numberOrUndefined(rawFace['tintindex']) };
    }
    return [{ from, to, rotation, ...(typeof item['shade'] === 'boolean' ? { shade: item['shade'] } : {}), ...(typeof item['shade_direction_override'] === 'string' ? { shadeDirectionOverride: item['shade_direction_override'] } : {}), faces }];
  });
}

function parseRotation(value: unknown): ResolvedElementRotation | undefined {
  if (!isRecord(value) || !Array.isArray(value['origin'])) return undefined;
  const origin = tuple(value['origin'], 3); if (!origin) return undefined;
  // Modern Mojang resources expose independent x/y/z angles. Legacy
  // axis/angle remains authoritative when both forms are present.
  if (['x', 'y', 'z'].includes(String(value['axis'])) && typeof value['angle'] === 'number') return { origin, axis: value['axis'] as 'x' | 'y' | 'z', angle: value['angle'], rescale: value['rescale'] === true };
  const rotations = (['x', 'y', 'z'] as const).flatMap((axis) => typeof value[axis] === 'number' && value[axis] !== 0 ? [{ axis, angle: value[axis] as number }] : []);
  if (rotations.length) return { origin, rotations, rescale: false };
  return undefined;
}

function resolveTextures(value: unknown, diagnostics: ResolverDiagnostic[], resource: string): { readonly values: Record<string, string>; readonly hints: Record<string, boolean> } {
  const raw = isRecord(value) ? value : {}; const output: Record<string, string> = {}; const hints: Record<string, boolean> = {};
  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    const reference = typeof entry === 'string' ? entry : isRecord(entry) && typeof entry['sprite'] === 'string' ? entry['sprite'] : undefined;
    if (!reference) { diagnostics.push(diagnostic('unsupported-model-behavior', `Unsupported texture reference for ${key}`, resource)); continue; }
    const resolved = resolveTextureReference(reference, raw, diagnostics, resource, new Set());
    output[key] = resolved;
    if (isRecord(entry) && entry['force_translucent'] === true) hints[resolved] = true;
  }
  return { values: output, hints };
}

function resolveTextureReference(value: string, textures: Readonly<Record<string, unknown>>, diagnostics: ResolverDiagnostic[], resource: string, chain = new Set<string>()): string {
  // Java 26.x block models may use a bare texture variable in a face
  // (for example `"texture": "all"`) instead of the legacy `#all` form.
  // Resolve it through the same variable chain before treating the value as
  // a namespaced resource location.
  const key = value.startsWith('#') ? value.slice(1) : Object.prototype.hasOwnProperty.call(textures, value) ? value : undefined;
  if (key === undefined) return resolveResourceLocation(value) ?? value;
  if (chain.has(key)) { diagnostics.push(diagnostic('texture-cycle', `Circular texture variable detected: ${value}`, resource)); return value; }
  const next = textures[key];
  const nextReference = typeof next === 'string' ? next : isRecord(next) && typeof next['sprite'] === 'string' ? next['sprite'] : undefined;
  if (!nextReference) { diagnostics.push(diagnostic('missing-texture', `Missing texture variable: ${value}`, resource)); return value; }
  return resolveTextureReference(nextReference, textures, diagnostics, resource, new Set([...chain, key]));
}

function blockstatePath(id: string): string { return resourcePath(id, 'blockstates') ?? `assets/minecraft/blockstates/${id}.json`; }
function modelPath(id: string): string { return resourcePath(id, 'models') ?? `assets/minecraft/models/${id}.json`; }
function specificity(key: string): number { return key ? key.split(',').length : 0; }
function stableHash(value: string): number { let hash = 2166136261; for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return (hash >>> 0); }
function numberOrUndefined(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined; }
function tuple(value: unknown, length: number): readonly [number, number, number] | undefined { return Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number') ? [value[0], value[1], value[2]] : undefined; }
function tuple4(value: unknown): readonly [number, number, number, number] | undefined { return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number') ? [value[0], value[1], value[2], value[3]] : undefined; }
function defaultFaceUv(direction: string, from: readonly [number, number, number], to: readonly [number, number, number]): readonly [number, number, number, number] | undefined {
  switch (direction) {
    case 'down': return [to[0], 16 - to[2], from[0], 16 - from[2]];
    case 'up': return [from[0], from[2], to[0], to[2]];
    case 'north': return [16 - to[0], 16 - to[1], 16 - from[0], 16 - from[1]];
    case 'south': return [from[0], 16 - to[1], to[0], 16 - from[1]];
    case 'west': return [from[2], 16 - to[1], to[2], 16 - from[1]];
    case 'east': return [16 - to[2], 16 - to[1], 16 - from[2], 16 - from[1]];
    default: return undefined;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function diagnostic(code: ResolverDiagnosticCode, message: string, resource?: string): ResolverDiagnostic { return { code, message, resource }; }
function result(blockId: string, state: BlockState, parts: readonly ResolvedModelPart[], support: BlockSupportLevel, ...diagnostics: ResolverDiagnostic[]): ResolvedBlockModel {
  const blockstateResource = blockstatePath(blockId);
  return { blockId, state: { ...state }, parts, support, diagnostics, trace: resolverTrace(blockstateResource, [], [], new Set(), new Set(), parts) };
}

function resolverTrace(blockstateResource: string, matchedVariantKeys: readonly string[], selected: readonly ConfiguredModel[], modelResources: ReadonlySet<string>, parentResources: ReadonlySet<string>, parts: readonly ResolvedModelPart[]): import('./resolver.types').ResolverTrace {
  const elements = parts.flatMap((part) => part.elements);
  return {
    blockstateResource,
    matchedVariantKeys: [...matchedVariantKeys],
    selectedModelIds: selected.map((model) => model.model),
    modelResources: [...modelResources],
    parentResources: [...parentResources],
    elementCount: elements.length,
    faceCount: elements.reduce((count, element) => count + Object.keys(element.faces).length, 0),
    textureResources: [...new Set(elements.flatMap((element) => Object.values(element.faces).map((face) => face.texture)))],
  };
}
