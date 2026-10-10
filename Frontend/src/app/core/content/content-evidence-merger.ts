import type {
  ContentPropertyEffects,
  ContentSemanticSupplement,
  ContentIntrospectionDiagnostic,
} from './content-semantic-types';
import type { NormalizedContentDescriptor } from './content-introspection';

export function mergeContentEvidence(
  staticDescriptor: NormalizedContentDescriptor,
  supplements: readonly ContentSemanticSupplement[] = [],
): NormalizedContentDescriptor {
  const relevant = [
    ...new Map(
      supplements
        .filter(
          (supplement) =>
            supplement.id === staticDescriptor.id &&
            (!supplement.sourceId || supplement.sourceId === staticDescriptor.sourceId),
        )
        .map((supplement) => [JSON.stringify(supplement), supplement] as const),
    ).values(),
  ];
  if (!relevant.length) return staticDescriptor;
  const properties = new Map(
    staticDescriptor.properties.map((property) => [property.name, property]),
  );
  const diagnostics = [...staticDescriptor.diagnostics];
  const defaults: Record<string, string> = { ...staticDescriptor.placementDefault };
  const capabilityProfile = [...(staticDescriptor.capabilityProfile ?? [])];
  const supportRequirements = [...(staticDescriptor.supportRequirements ?? [])];
  const supportContracts = [...(staticDescriptor.supportContracts ?? [])];
  const semanticEvidence = [...staticDescriptor.semanticEvidence];
  let specialVisual = staticDescriptor.specialVisual;
  let itemHostVisual = staticDescriptor.itemHostVisual;
  let stateSchemaIncomplete = staticDescriptor.stateSchemaIncomplete;
  for (const supplement of relevant) {
    for (const [name, value] of Object.entries(supplement.defaultState ?? {})) {
      if (defaults[name] !== undefined && defaults[name] !== value)
        diagnostics.push({
          code: 'semantic-contract-mismatch',
          message: `Verified semantic evidence conflicts with the default value for ${name}.`,
          sourceId: staticDescriptor.sourceId,
        });
      else defaults[name] = value;
    }
    for (const property of supplement.properties ?? []) {
      const current = properties.get(property.name);
      if (
        current &&
        current.values.length &&
        property.values.length &&
        !current.values.some((value) => property.values.includes(value))
      )
        diagnostics.push({
          code: 'semantic-contract-mismatch',
          message: `Verified semantic evidence conflicts with static property values for ${property.name}.`,
          sourceId: staticDescriptor.sourceId,
        });
      const effects: ContentPropertyEffects = {
        visual: property.effects?.visual ?? current?.effects.visual ?? false,
        placement: property.effects?.placement ?? current?.effects.placement ?? false,
        behavior: property.effects?.behavior ?? current?.effects.behavior ?? false,
        attachment: property.effects?.attachment ?? current?.effects.attachment ?? false,
        connection: property.effects?.connection ?? current?.effects.connection ?? false,
        itemDisplay: property.effects?.itemDisplay ?? current?.effects.itemDisplay ?? false,
        runtimeUnknown: property.effects?.runtimeUnknown ?? current?.effects.runtimeUnknown ?? true,
      };
      properties.set(property.name, {
        name: property.name,
        values: [...new Set([...(current?.values ?? []), ...property.values])].sort(),
        ...(property.defaultValue !== undefined || current?.defaultValue !== undefined
          ? { defaultValue: property.defaultValue ?? current?.defaultValue }
          : {}),
        derived: property.derived ?? current?.derived ?? false,
        provenance: property.provenance ?? 'trusted-data',
        effects,
        evidence: [...new Set([...(current?.evidence ?? []), ...(property.evidence ?? [])])],
      });
      if (property.defaultValue !== undefined && defaults[property.name] === undefined)
        defaults[property.name] = property.defaultValue;
      else if (
        property.defaultValue !== undefined &&
        defaults[property.name] !== undefined &&
        defaults[property.name] !== property.defaultValue
      )
        diagnostics.push({
          code: 'semantic-contract-mismatch',
          message: `Verified semantic evidence conflicts with the default value for ${property.name}.`,
          sourceId: staticDescriptor.sourceId,
        });
    }
    for (const capability of supplement.capabilities ?? [])
      if (
        !capabilityProfile.some((current) => JSON.stringify(current) === JSON.stringify(capability))
      )
        capabilityProfile.push(capability);
    for (const requirement of supplement.supportRequirements ?? [])
      if (
        !supportRequirements.some(
          (current) => JSON.stringify(current) === JSON.stringify(requirement),
        )
      )
        supportRequirements.push(requirement);
    for (const contract of supplement.supportContracts ?? [])
      if (!supportContracts.includes(contract)) supportContracts.push(contract);
    if (supplement.specialVisual) {
      if (
        specialVisual &&
        JSON.stringify(specialVisual) !== JSON.stringify(supplement.specialVisual)
      )
        diagnostics.push({
          code: 'semantic-contract-mismatch',
          message: 'Verified semantic evidence conflicts with the special visual descriptor.',
          sourceId: staticDescriptor.sourceId,
        });
      else specialVisual = supplement.specialVisual;
    }
    if (supplement.itemHostVisual) {
      if (
        itemHostVisual &&
        JSON.stringify(itemHostVisual) !== JSON.stringify(supplement.itemHostVisual)
      )
        diagnostics.push({
          code: 'semantic-contract-mismatch',
          message: 'Verified semantic evidence conflicts with the item host visual descriptor.',
          sourceId: staticDescriptor.sourceId,
        });
      else itemHostVisual = supplement.itemHostVisual;
    }
    for (const evidence of supplement.semanticEvidence ?? [])
      if (!semanticEvidence.some((current) => JSON.stringify(current) === JSON.stringify(evidence)))
        semanticEvidence.push(evidence);
    diagnostics.push(...(supplement.diagnostics ?? []));
    if (supplement.stateSchemaIncomplete !== undefined)
      stateSchemaIncomplete = supplement.stateSchemaIncomplete;
  }
  const mergedProperties = [...properties.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return {
    ...staticDescriptor,
    properties: mergedProperties,
    placementDefault: defaults,
    capabilities: [
      ...new Set([
        ...staticDescriptor.capabilities,
        ...capabilityProfile.map((capability) => capability.kind),
      ]),
    ],
    capabilityProfile: capabilityProfile.length
      ? capabilityProfile
      : staticDescriptor.capabilityProfile,
    supportRequirements: supportRequirements.length
      ? supportRequirements
      : staticDescriptor.supportRequirements,
    supportContracts: supportContracts.length
      ? supportContracts
      : staticDescriptor.supportContracts,
    ...(specialVisual ? { specialVisual } : {}),
    ...(itemHostVisual ? { itemHostVisual } : {}),
    semanticEvidence,
    stateSchemaIncomplete,
    diagnostics: uniqueDiagnostics(diagnostics),
  };
}

export function uniqueDiagnostics(
  diagnostics: readonly ContentIntrospectionDiagnostic[],
): readonly ContentIntrospectionDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}|${diagnostic.resource}|${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
