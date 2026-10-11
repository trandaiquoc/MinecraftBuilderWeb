export type MinecraftContentKind =
  | 'world-block'
  | 'block-backed-item'
  | 'logical-block-item'
  | 'internal-block'
  | 'technical-block'
  | 'decoration-entity'
  | 'item-only'
  | 'unknown';

export type ContentClassificationProvenance =
  | 'authoritative-registry'
  | 'target-resource'
  | 'common-java-semantic'
  | 'logical-rule'
  | 'inferred'
  | 'unknown';

export interface ContentClassification {
  readonly kind: MinecraftContentKind;
  readonly placeable: boolean;
  readonly provenance: ContentClassificationProvenance;
  readonly worldBlock: boolean;
  readonly item: boolean;
  readonly internal: boolean;
  readonly technical: boolean;
  readonly decoration: boolean;
}
