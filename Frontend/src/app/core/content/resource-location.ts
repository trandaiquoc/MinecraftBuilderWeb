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

export function resourceIdFromPath(path: string, directory: 'blockstates' | 'models' | 'textures' | 'items' | 'atlases', extension = 'json'): string | undefined {
  const match = new RegExp(`^assets/([^/]+)/${directory}/(.+)\\.${extension.replace('.', '\\.')}$`).exec(path);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

function validPath(path: string): boolean { return !!path && !path.startsWith('/') && !path.includes('..') && !path.includes('\\') && !/\s/.test(path); }
