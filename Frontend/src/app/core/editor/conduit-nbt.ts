export interface MinecraftConduitBlockEntityNbt { readonly id: 'minecraft:conduit'; }

/** Static authored Conduits have no block-entity fields; runtime activation is not persisted. */
export function toMinecraftConduitBlockEntityNbt(): MinecraftConduitBlockEntityNbt { return { id: 'minecraft:conduit' }; }
