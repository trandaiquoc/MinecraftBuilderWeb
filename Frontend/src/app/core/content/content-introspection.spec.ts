import { describe, expect, it } from 'vitest';
import { ContentIntrospectionEngine } from './content-introspection';
import type { AssetResourceProvider } from '../blocks/resolver/resolver.types';
import type { AssetBlockRecord } from '../blocks/catalog/block-definition.types';

class Resources implements AssetResourceProvider {
  readonly source = { id: 'fixture', kind: 'external' as const, displayName: 'Fixture', minecraftVersion: '1.21.1', namespaces: ['fixture'] };
  constructor(private readonly data: Readonly<Record<string, unknown>>) {}
  readJson(path: string): unknown | undefined { return this.data[path]; }
  paths(): readonly string[] { return Object.keys(this.data); }
}

describe('content introspection', () => {
  it('preserves observed properties, predicates and resource provenance', () => {
    const provider = new Resources({
      'assets/fixture/blockstates/widget.json': { variants: { 'mode=idle,stage=1,powered=false': { model: 'fixture:block/idle' }, 'mode=idle,stage=1,powered=true': { model: 'fixture:block/idle' }, 'mode=active,stage=1,powered=false': { model: 'fixture:block/active' }, 'mode=active,stage=2,powered=false': { model: 'fixture:block/active2' } } },
      'assets/fixture/models/block/idle.json': { elements: [] },
      'assets/fixture/models/block/active.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] },
      'assets/fixture/models/block/active2.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }, { from: [2, 2, 2], to: [14, 14, 14], faces: {} }] },
    });
    const record: AssetBlockRecord = { id: 'fixture:widget', displayName: 'Widget', defaultState: { mode: 'idle', stage: '1', powered: 'false' }, stateDefinitions: [{ name: 'mode', values: ['idle', 'active'] }], resources: { blockstate: 'assets/fixture/blockstates/widget.json', model: 'fixture:block/idle', textures: [] }, support: 'partial', sourceId: 'fixture', sourceName: 'Fixture' };
    const descriptor = new ContentIntrospectionEngine(provider).inspectBlock(record);
    expect(descriptor.roles).toEqual(['block']);
    expect(descriptor.properties.map((property) => property.name)).toEqual(['mode', 'powered', 'stage']);
    expect(descriptor.properties.find((property) => property.name === 'stage')?.values).toEqual(['1', '2']);
    expect(descriptor.properties.find((property) => property.name === 'mode')?.effects.visual).toBe(true);
    expect(descriptor.properties.find((property) => property.name === 'stage')?.effects.visual).toBe(true);
    expect(descriptor.properties.find((property) => property.name === 'powered')?.effects.visual).toBe(false);
    expect(descriptor.placementDefault).toEqual(record.defaultState);
    expect(descriptor.resourceGraph.nodes.some((node) => node.id.includes('active.json'))).toBe(true);
    expect(descriptor.representativeVisualState).not.toEqual(descriptor.placementDefault);
  });

  it('keeps item and supported decoration roles independent from block role', () => {
    const engine = new ContentIntrospectionEngine(new Resources({}));
    expect(engine.inspectItem({ itemId: 'fixture:gem', referencedModels: ['fixture:item/gem'], referencedResources: [], sourceFormat: 'modern-item-definition' }).roles).toEqual(['item']);
    expect(engine.inspectDecoration('fixture:painting', ['fixture:painting/poster'], 'fixture', 'Fixture').roles).toEqual(['decoration']);
  });

  it('normalizes nested multipart predicates without dropping properties', () => {
    const provider = new Resources({
      'assets/fixture/blockstates/panel.json': { variants: { 'enabled=false': { model: 'fixture:block/base' } }, multipart: [{ when: { AND: [{ north: 'true' }, { OR: [{ east: 'true' }, { west: 'true' }] }] }, apply: { model: 'fixture:block/side' } }] },
      'assets/fixture/models/block/base.json': { elements: [] },
      'assets/fixture/models/block/side.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] },
    });
    const descriptor = new ContentIntrospectionEngine(provider).inspectBlock({ id: 'fixture:panel', displayName: 'Panel', defaultState: { enabled: 'false', north: 'false', east: 'false', west: 'false' }, stateDefinitions: [], resources: { blockstate: 'assets/fixture/blockstates/panel.json', model: 'fixture:block/base', textures: [] }, support: 'partial', sourceId: 'fixture' });
    expect(descriptor.properties.map((property) => property.name)).toEqual(['east', 'enabled', 'north', 'west']);
    expect(descriptor.predicates[0]?.kind).toBe('properties');
    expect(descriptor.predicates[1]?.kind).toBe('all');
  });

  it('reports malformed explicit predicates without treating them as unconditional', () => {
    const provider = new Resources({
      'assets/fixture/blockstates/widget.json': { multipart: [{ when: { stage: { unsupported: true } }, apply: { model: 'fixture:block/side' } }] },
      'assets/fixture/models/block/side.json': { elements: [] },
    });
    const descriptor = new ContentIntrospectionEngine(provider).inspectBlock({ id: 'fixture:widget', displayName: 'Widget', defaultState: {}, stateDefinitions: [], resources: { blockstate: 'assets/fixture/blockstates/widget.json', model: 'fixture:block/side', textures: [] }, support: 'partial', sourceId: 'fixture' });
    expect(descriptor.predicates[0]?.kind).toBe('invalid');
    expect(descriptor.diagnostics.some((diagnostic) => diagnostic.code === 'malformed-resource')).toBe(true);
    expect(descriptor.representativeVisualState).toEqual({});
  });

  it('merges verified semantic supplements without losing static evidence', () => {
    const provider = new Resources({});
    const descriptor = new ContentIntrospectionEngine(provider).inspectBlock({
      id: 'fixture:display', displayName: 'Display', defaultState: { mode: 'a' }, stateDefinitions: [{ name: 'mode', values: ['a', 'b'] }],
      resources: { textures: [] }, support: 'partial', sourceId: 'fixture',
      semanticSupplements: [{ id: 'fixture:display', sourceId: 'fixture', properties: [{ name: 'slot', values: ['0'], defaultValue: '0', effects: { itemDisplay: true }, provenance: 'trusted-data' }], capabilities: [{ kind: 'item-storage-display', slotCount: 1, evidence: 'verified' }] }],
    });
    expect(descriptor.properties.map((property) => property.name)).toEqual(['mode', 'slot']);
    expect(descriptor.properties.find((property) => property.name === 'slot')?.effects.itemDisplay).toBe(true);
    expect(descriptor.capabilityProfile).toContainEqual({ kind: 'item-storage-display', slotCount: 1, evidence: 'verified' });
    expect(descriptor.capabilities).toContain('item-storage-display');
  });

  it('retains a conflict diagnostic when supplement values disagree with static values', () => {
    const descriptor = new ContentIntrospectionEngine(new Resources({})).inspectBlock({
      id: 'fixture:conflict', displayName: 'Conflict', defaultState: { mode: 'a' }, stateDefinitions: [{ name: 'mode', values: ['a', 'b'] }], resources: { textures: [] }, support: 'partial', sourceId: 'fixture',
      semanticSupplements: [{ id: 'fixture:conflict', properties: [{ name: 'mode', values: ['verified'] }] }],
    });
    expect(descriptor.properties.find((property) => property.name === 'mode')?.values).toEqual(['a', 'b', 'verified']);
    expect(descriptor.diagnostics.some((diagnostic) => diagnostic.code === 'semantic-contract-mismatch')).toBe(true);
  });

  it('accepts supplements from an explicit source-independent evidence provider', () => {
    const provider = new Resources({});
    const evidenceProvider = { supplementsFor: (id: string) => id === 'fixture:provider' ? [{ id, properties: [{ name: 'runtime_mode', values: ['safe'], effects: { behavior: true } }] }] : [] };
    const descriptor = new ContentIntrospectionEngine(provider, evidenceProvider).inspectBlock({ id: 'fixture:provider', displayName: 'Provider', defaultState: {}, stateDefinitions: [], resources: { textures: [] }, support: 'partial', sourceId: 'fixture' });
    expect(descriptor.properties.find((property) => property.name === 'runtime_mode')?.effects.behavior).toBe(true);
  });
});
