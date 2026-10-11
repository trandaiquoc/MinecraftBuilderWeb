import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';

export function isStructureJsonSignHost(id: string, definition?: BlockDefinition): boolean {
  return (
    blockCapability(definition, 'block-entity')?.entityKind === 'sign' ||
    (id.startsWith('minecraft:') &&
      (/(?:^|_)(?:wall_)?sign$/.test(id.slice(10)) ||
        id.endsWith('_hanging_sign') ||
        id.endsWith('_wall_hanging_sign')))
  );
}
