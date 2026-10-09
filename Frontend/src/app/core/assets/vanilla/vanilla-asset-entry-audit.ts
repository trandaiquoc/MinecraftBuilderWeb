import * as THREE from 'three';
import type {
  BlockDefinition,
  VisualSupportLevel,
} from '../../blocks/catalog/block-definition.types';
import { ResolverDiagnosticCode, BlockModelResolver } from '../../blocks/resolver';
import { VanillaBlockVisualProvider } from '../../renderer/geometry/vanilla-block-visual-provider';
import { texturePath, VanillaAssetProvider } from './vanilla-asset-provider';
import type { AssetAuditReason, VanillaAssetAuditRecord } from './vanilla-asset-audit.types';

export async function auditVanillaAssetEntry(
  definition: BlockDefinition,
  provider: VanillaAssetProvider,
  resolver: BlockModelResolver,
  visualProvider: VanillaBlockVisualProvider,
  decodeCache: Map<string, Promise<boolean>>,
  decodeTexture: (bytes: Uint8Array, path: string) => Promise<boolean>,
): Promise<VanillaAssetAuditRecord> {
  const reasons = new Set<AssetAuditReason>();
  const blockstateResource = `assets/${definition.namespace}/blockstates/${definition.id.slice(definition.id.indexOf(':') + 1)}.json`;
  const blockstateDocument = provider.readJson(blockstateResource);
  const kind = blockstateKind(record(blockstateDocument));
  if (!blockstateDocument) reasons.add('BLOCKSTATE_NOT_FOUND');
  if (definition.defaultStateSource === 'unknown') reasons.add('DEFAULT_STATE_UNKNOWN');
  const resolved = resolver.resolve(definition.id, definition.defaultState, definition.id);
  for (const diagnostic of resolved.diagnostics) {
    const reason = resolverReason(diagnostic.code);
    if (reason) reasons.add(reason);
  }
  if (resolved.diagnostics.some((item) => item.code === 'no-matching-variant')) {
    reasons.add('VARIANT_NO_MATCH');
    reasons.add(
      definition.defaultStateSource === 'unknown'
        ? 'DEFAULT_STATE_VARIANT_NO_MATCH'
        : 'DEFAULT_STATE_INCOMPLETE',
    );
  }
  if (
    (kind === 'multipart' || kind === 'both') &&
    !resolved.parts.length &&
    !resolved.diagnostics.some((item) => item.code === 'no-matching-variant')
  )
    reasons.add('MULTIPART_NO_MATCH');
  if (!resolved.trace.elementCount) reasons.add('NO_ELEMENTS');
  const intentionallyInvisible = intentionallyInvisibleBlocks.has(definition.id);
  const specialRenderer =
    !intentionallyInvisible &&
    (hasSpecialModel(resolved.trace.modelResources, provider) ||
      (!!blockstateDocument && resolved.parts.length > 0 && resolved.trace.elementCount === 0));
  if (intentionallyInvisible) reasons.add('INTENTIONALLY_INVISIBLE');
  else if (specialRenderer) reasons.add('SPECIAL_RENDERER_REQUIRED');

  const texturePaths = resolved.trace.textureResources.map(texturePath);
  const textureResults = await Promise.all(
    texturePaths.map(async (path) => {
      const bytes = provider.readBinary(path);
      if (!bytes) {
        reasons.add('TEXTURE_NOT_FOUND');
        return { found: false, decoded: false };
      }
      let decoding = decodeCache.get(path);
      if (!decoding) {
        decoding = decodeTexture(bytes, path);
        decodeCache.set(path, decoding);
      }
      const decoded = await decoding;
      if (!decoded) reasons.add('TEXTURE_DECODE_FAILED');
      return { found: true, decoded };
    }),
  );

  const [namespace] = definition.id.split(':');
  const visual = await visualProvider.create({
    kind: 'resolved',
    id: definition.id,
    namespace,
    position: { x: 0, y: 0, z: 0 },
    state: definition.defaultState,
  });
  try {
    if (
      (!visual.trace.geometryBuilt && resolved.trace.elementCount > 0) ||
      visual.diagnostics.some((item) => item.code === 'GEOMETRY_BUILD_FAILED')
    )
      reasons.add('GEOMETRY_BUILD_FAILED');
    const visualSupport = classifyVisualSupport({
      renderMode: visual.mode,
      defaultKnown: definition.defaultStateSource !== 'unknown',
      specialModel: specialRenderer || intentionallyInvisible,
      texturesDecoded: textureResults.every((item) => item.decoded),
      geometryBuilt: visual.trace.geometryBuilt,
    });
    const thumbnail = visualProvider.thumbnailUrl(definition.id, definition.defaultState)
      ? 'real'
      : visual.object
        ? 'fallback'
        : 'unavailable';
    return {
      registryId: definition.id,
      family: reportFamily(definition.id),
      catalog: {
        found: true,
        displayName: definition.displayName,
        behaviorSupport: definition.behaviorSupport,
        capabilities: definition.capabilities ?? [],
      },
      defaultState: {
        known: definition.defaultStateSource !== 'unknown',
        source: definition.defaultStateSource,
        state: { ...definition.defaultState },
      },
      blockstate: {
        resource: blockstateResource,
        exists: !!blockstateDocument,
        parsed: !!blockstateDocument,
        kind,
        selectedConfigurationCount: resolved.parts.length,
      },
      model: {
        ids: resolved.trace.selectedModelIds,
        parentResolved: !resolved.diagnostics.some(
          (item) => item.code === 'missing-parent' || item.code === 'parent-cycle',
        ),
        elementCount: resolved.trace.elementCount,
        faceCount: resolved.trace.faceCount,
        resources: resolved.trace.modelResources,
        parentResources: resolved.trace.parentResources,
      },
      texture: {
        referencedCount: texturePaths.length,
        resolvedCount: textureResults.filter((item) => item.found).length,
        missingCount: textureResults.filter((item) => !item.found).length,
        decodeSuccessCount: textureResults.filter((item) => item.decoded).length,
        decodeFailureCount: textureResults.filter((item) => item.found && !item.decoded).length,
      },
      geometry: {
        buildSuccess: visual.trace.geometryBuilt,
        geometryCount: resolved.trace.faceCount,
        bounds: visual.trace.bounds,
      },
      render: {
        visualSupport,
        classification: intentionallyInvisible
          ? 'intentionally-invisible'
          : specialRenderer
            ? 'special-renderer-required'
            : 'standard-json',
        renderMode: visual.mode,
        fallbackReason: visualSupport === 'fallback' ? [...reasons][0] : undefined,
        reasons: [...reasons].sort(),
      },
      thumbnail,
    };
  } finally {
    if (visual.object) disposeObject(visual.object);
  }
}

export function classifyVisualSupport(input: {
  readonly renderMode: 'real' | 'partial' | 'fallback';
  readonly defaultKnown: boolean;
  readonly specialModel: boolean;
  readonly texturesDecoded: boolean;
  readonly geometryBuilt: boolean;
}): VisualSupportLevel {
  if (input.renderMode === 'fallback' || !input.geometryBuilt) return 'fallback';
  return input.renderMode === 'partial' ||
    !input.defaultKnown ||
    input.specialModel ||
    !input.texturesDecoded
    ? 'partial'
    : 'real';
}

export async function decodePng(bytes: Uint8Array): Promise<boolean> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }),
      );
      bitmap.close();
      return true;
    } catch {
      return false;
    }
  }
  return validPngContainer(bytes);
}

function blockstateKind(
  value: Record<string, unknown>,
): 'variants' | 'multipart' | 'both' | 'other' {
  const variants = typeof value['variants'] === 'object' && value['variants'] !== null;
  const multipart = Array.isArray(value['multipart']);
  return variants && multipart ? 'both' : variants ? 'variants' : multipart ? 'multipart' : 'other';
}
function resolverReason(code: ResolverDiagnosticCode): AssetAuditReason | undefined {
  return (
    {
      'missing-blockstate': 'BLOCKSTATE_NOT_FOUND',
      'malformed-blockstate': 'BLOCKSTATE_PARSE_FAILED',
      'no-matching-variant': 'VARIANT_NO_MATCH',
      'missing-model': 'MODEL_NOT_FOUND',
      'malformed-model': 'UNSUPPORTED_MODEL_FORMAT',
      'missing-parent': 'PARENT_NOT_FOUND',
      'parent-cycle': 'PARENT_CYCLE',
      'missing-texture': 'TEXTURE_VARIABLE_UNRESOLVED',
      'texture-cycle': 'TEXTURE_VARIABLE_UNRESOLVED',
      'unsupported-model-behavior': 'UNSUPPORTED_MODEL_FORMAT',
    } as const
  )[code];
}
function hasSpecialModel(resources: readonly string[], provider: VanillaAssetProvider): boolean {
  return resources.some((path) => {
    const model = record(provider.readJson(path));
    const parent = model['parent'];
    const particleOnly =
      parent === undefined &&
      model['elements'] === undefined &&
      Object.keys(record(model['textures'])).length > 0;
    return (
      particleOnly ||
      (typeof parent === 'string' &&
        (parent.includes('builtin/') || parent === 'item/generated' || parent === 'item/handheld'))
    );
  });
}
const intentionallyInvisibleBlocks = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
  'minecraft:light',
]);
function reportFamily(id: string): string {
  const name = id.slice(id.indexOf(':') + 1);
  const groups: readonly [RegExp, string][] = [
    [/_slab$/, 'slabs'],
    [/_stairs$/, 'stairs'],
    [/_door$/, 'doors'],
    [/_trapdoor$/, 'trapdoors'],
    [/_bed$/, 'beds'],
    [/(sapling|flower|tulip|orchid|dandelion|sunflower|rose|mushroom|bush|fern|grass)$/, 'plants'],
    [/_torch$/, 'torches'],
    [/_wall$/, 'walls'],
    [/_fence$/, 'fences'],
    [/(pane|iron_bars)$/, 'panes-bars'],
    [/_rail$/, 'rails'],
    [/(redstone|repeater|comparator|observer|piston)/, 'redstone-like'],
    [/(crop|wheat|carrots|potatoes|beetroots|stem)$/, 'crops'],
    [/(water|lava)$/, 'fluids'],
    [/(head|skull)$/, 'heads-skulls'],
    [/(banner|sign)$/, 'banners-signs'],
    [/(chest|barrel|shulker_box)$/, 'containers'],
  ];
  return groups.find(([pattern]) => pattern.test(name))?.[1] ?? 'other';
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function validPngContainer(bytes: Uint8Array): boolean {
  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    return false;
  let offset = 8;
  let ihdr = false;
  let iend = false;
  while (offset + 12 <= bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    if (length < 0 || offset + 12 + length > bytes.length) return false;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === 'IHDR') ihdr = length === 13;
    if (type === 'IEND') {
      iend = length === 0;
      break;
    }
    offset += 12 + length;
  }
  return ihdr && iend;
}
function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.userData['providerOwnedGeometry']) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.map?.userData['ownedBedAtlasTexture']) material.map.dispose();
      material.dispose();
    }
  });
}
