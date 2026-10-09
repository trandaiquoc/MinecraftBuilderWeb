/**
 * Minecraft resource-location syntax shared by blockstate/model/item and
 * decoration readers. Bare locations in JSON resource references use the
 * format's default namespace (Minecraft's default is `minecraft`).
 */
export type ResourceLocationKind = 'namespaced' | 'bare' | 'variable';

export interface ResourceLocation {
  readonly namespace: string;
  readonly path: string;
  readonly kind: ResourceLocationKind;
  readonly raw: string;
}

const NAMESPACE = /^[a-z0-9_.-]+$/;
const RESOURCE_LOCATION_PATH = /^[a-z0-9/._-]+$/;

/** Strict namespaced ResourceLocation validation for persisted/exported IDs. */
export function isValidNamespacedResourceLocation(value: string): boolean {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator !== value.lastIndexOf(':')) return false;
  return NAMESPACE.test(value.slice(0, separator)) && RESOURCE_LOCATION_PATH.test(value.slice(separator + 1));
}

export function parseResourceLocation(value: string, defaultNamespace = 'minecraft'): ResourceLocation | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith('#')) {
    const path = raw.slice(1);
    return path && validPath(path) ? { namespace: defaultNamespace, path, kind: 'variable', raw } : undefined;
  }
  const separator = raw.indexOf(':');
  const namespace = separator < 0 ? defaultNamespace : raw.slice(0, separator);
  const path = separator < 0 ? raw : raw.slice(separator + 1);
  if (!NAMESPACE.test(namespace) || !validPath(path)) return undefined;
  return { namespace, path, kind: separator < 0 ? 'bare' : 'namespaced', raw };
}

export function resolveResourceLocation(value: string, defaultNamespace = 'minecraft'): string | undefined {
  const parsed = parseResourceLocation(value, defaultNamespace);
  return parsed && parsed.kind !== 'variable' ? `${parsed.namespace}:${parsed.path}` : undefined;
}

export function resourcePath(value: string, directory: 'blockstates' | 'models' | 'textures' | 'items' | 'atlases', extension = 'json', defaultNamespace = 'minecraft'): string | undefined {
  const location = resolveResourceLocation(value, defaultNamespace);
  if (!location) return undefined;
  const [namespace, path] = location.split(':', 2);
  return `assets/${namespace}/${directory}/${path}.${extension}`;
}

export function textureResourcePath(resource: string): string {
  if (resource.startsWith('assets/')) return resource.endsWith('.png') ? resource : `${resource}.png`;
  const normalized = resolveResourceLocation(resource.replace(/^textures\//, '').replace(/\.png$/, ''));
  if (!normalized) return resource;
  const [namespace, rawPath] = normalized.split(':', 2);
  const path = rawPath.replace(/^textures\//, '').replace(/\.png$/, '');
  return `assets/${namespace}/textures/${path}.png`;
}

export function resourceIdFromPath(path: string, directory: 'blockstates' | 'models' | 'textures' | 'items' | 'atlases', extension = 'json'): string | undefined {
  const match = new RegExp(`^assets/([^/]+)/${directory}/(.+)\\.${extension.replace('.', '\\.')}$`).exec(path);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function validPath(path: string): boolean { return !!path && !path.startsWith('/') && !path.includes('..') && !path.includes('\\') && !/\s/.test(path); }
