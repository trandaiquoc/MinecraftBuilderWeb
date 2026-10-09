import type { AssetBlockRecord, BlockStateDefinition } from '../blocks/catalog/block-definition.types';
import { blockCapability, hasBlockCapability } from '../blocks/capabilities/block-capability-resolver';
import type { ResolvedBlockModel } from '../blocks/resolver/resolver.types';
import { BlockModelResolver } from '../blocks/resolver/block-model-resolver';
import type { NormalizedPredicate } from './normalized-predicate';
import type { ContentPropertyDescriptor } from './content-semantic-types';

export function mergeBlockStateDefinitions(definitions: readonly BlockStateDefinition[], predicates: readonly NormalizedPredicate[]): readonly BlockStateDefinition[] {
  const values = new Map<string, Set<string>>(); const derived = new Set<string>();
  for (const definition of definitions) { values.set(definition.name, new Set(definition.values)); if (definition.derived) derived.add(definition.name); }
  const visit = (predicate: NormalizedPredicate): void => { if (predicate.kind === 'properties') for (const item of predicate.properties ?? []) values.set(item.property, new Set([...(values.get(item.property) ?? []), ...item.values])); else for (const child of predicate.predicates ?? []) visit(child); };
  predicates.forEach(visit);
  return [...values].sort(([left], [right]) => left.localeCompare(right)).map(([name, options]) => ({ name, values: [...options].sort(), ...(derived.has(name) ? { derived: true } : {}) }));
}

export function inspectContentProperty(id: string, definition: BlockStateDefinition, baseline: Readonly<Record<string, string>>, base: ResolvedBlockModel, record: AssetBlockRecord, resolver: BlockModelResolver): ContentPropertyDescriptor {
  const values = [...new Set(definition.values)].sort();
  const visual = values.some((value) => {
    const candidate = resolver.resolve(id, { ...baseline, [definition.name]: value });
    return modelSignature(candidate) !== modelSignature(base);
  });
  const evidence = visual ? ['resource model selection differs for at least one observed value'] : ['no resource selection difference observed'];
  const behavior = behaviorEffects(record, definition.name);
  return { name: definition.name, values, ...(baseline[definition.name] !== undefined ? { defaultValue: baseline[definition.name] } : {}), derived: definition.derived === true, provenance: 'resource-backed', effects: { visual, placement: behavior.placement, behavior: behavior.behavior, attachment: behavior.attachment, connection: behavior.connection, itemDisplay: false, runtimeUnknown: !behavior.known }, evidence: [...evidence, ...behavior.evidence] };
}

export function representativeContentState(id: string, baseline: Readonly<Record<string, string>>, properties: readonly ContentPropertyDescriptor[], resolver: BlockModelResolver): Readonly<Record<string, string>> {
  let best = { ...baseline }; let bestScore = score(resolver.resolve(id, best));
  for (const property of properties.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    if (!property.effects.visual || property.derived || property.effects.placement || property.effects.attachment || property.effects.connection) continue;
    for (const value of property.values.slice().sort()) {
      if (value === baseline[property.name]) continue;
      const candidate = { ...baseline, [property.name]: value }; const candidateScore = score(resolver.resolve(id, candidate));
      if (candidateScore > bestScore) { best = candidate; bestScore = candidateScore; }
    }
  }
  return best;
}

function score(model: ResolvedBlockModel): number { return (model.parts.length ? 100 : 0) + model.parts.reduce((sum, part) => sum + part.elements.length, 0) - model.diagnostics.length * 20; }
function modelSignature(model: ResolvedBlockModel): string { return JSON.stringify(model.parts.map((part) => [part.model, part.transform, part.elements.length, Object.keys(part.textures).sort()])); }
function behaviorEffects(record: AssetBlockRecord, property: string): { readonly known: boolean; readonly behavior: boolean; readonly placement: boolean; readonly attachment: boolean; readonly connection: boolean; readonly evidence: readonly string[] } {
  const behavior = record.behavior;
  if (!behavior) {
    const axis = blockCapability(record.capabilities, 'axis-oriented');
    if (axis?.axisProperty === property) return { known: true, behavior: true, placement: true, attachment: false, connection: false, evidence: ['verified axis-oriented placement contract'] };
    if (hasBlockCapability(record.capabilities, 'direct-placement')) return { known: true, behavior: false, placement: false, attachment: false, connection: false, evidence: ['verified direct-placement contract'] };
    return { known: false, behavior: false, placement: false, attachment: false, connection: false, evidence: ['no verified common semantic contract for this property'] };
  }
  const derived = behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? (behavior.derivedProperties as readonly string[]).includes(property) : false;
  const placement = behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign' || behavior.kind === 'wall-hanging-sign' || behavior.kind === 'head-placement' ? property === ('facing' in behavior ? behavior.facingProperty : 'rotation') : behavior.kind === 'standing-sign' || behavior.kind === 'hanging-sign' ? property === behavior.rotationProperty || behavior.kind === 'hanging-sign' && property === behavior.attachedProperty : behavior.kind === 'paired-horizontal' ? property === behavior.partProperty || property === behavior.facingProperty : behavior.kind === 'double-height' ? property === behavior.halfProperty : behavior.kind === 'stairs' ? property === 'facing' || property === 'half' : behavior.kind === 'vertical-chain' ? property === behavior.axisProperty : behavior.kind === 'lantern-placement' ? property === behavior.hangingProperty : behavior.kind === 'six-face-placement' || behavior.kind === 'attached-six-face-placement' ? property === behavior.facingProperty : behavior.kind === 'decorated-pot-placement' ? property === behavior.facingProperty : behavior.kind === 'conduit-placement' ? property === behavior.waterloggedProperty : behavior.kind === 'button' ? property === behavior.faceProperty || property === behavior.facingProperty : false;
  const attachment = behavior.kind === 'wall-mounted' || behavior.kind === 'wall-sign' || behavior.kind === 'wall-hanging-sign' || behavior.kind === 'torch-placement' || behavior.kind === 'lantern-placement' || behavior.kind === 'hanging-sign' || behavior.kind === 'attached-six-face-placement' ? property === ('facingProperty' in behavior ? behavior.facingProperty : behavior.kind === 'hanging-sign' ? behavior.attachedProperty : 'hanging') : false;
  const connection = behavior.kind === 'horizontal-connect' || behavior.kind === 'stairs' ? derived : false;
  return { known: true, behavior: derived || placement || attachment || connection, placement, attachment, connection, evidence: [`common semantic contract ${behavior.kind} observes ${property}`] };
}
