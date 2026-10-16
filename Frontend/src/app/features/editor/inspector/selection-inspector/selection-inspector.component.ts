import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { LucideCheck, LucideX } from '@lucide/angular';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { isSignDefinition, isSignId } from '../../../../core/block-entities/sign/sign-block-entity';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { DecorationService } from '../../../../core/decorations/decoration.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { blockGroupNames, isBlockLocked } from '../../../../core/editor/groups/group-membership';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { DecorationInspectorComponent } from '../decoration-inspector/decoration-inspector.component';
import { SignInspectorComponent } from '../sign-inspector/sign-inspector.component';
import {
  ThemedSelectComponent,
  ThemedSelectOption,
} from '../../../../shared/ui/themed-select/themed-select.component';
import { ItemDisplayInspectorComponent } from '../item-display-inspector/item-display-inspector.component';
import { blockCapability } from '../../../../core/blocks/capabilities/block-capability-resolver';
import { verifiedInventoryContainerSchema } from '../../../../core/block-entities/item-display/inventory-storage-schema';
import { InventoryStorageInspectorComponent } from '../inventory-storage-inspector/inventory-storage-inspector.component';
import { DecoratedPotInspectorComponent } from '../decorated-pot-inspector/decorated-pot-inspector.component';
import type { ContentPropertyDescriptor } from '../../../../core/content/content-introspection';
import { DECORATED_POT_ID } from '../../../../core/block-entities/decorated-pot/decorated-pot';

@Component({
  selector: 'app-selection-inspector',
  imports: [
    LucideCheck,
    LucideX,
    DecorationInspectorComponent,
    SignInspectorComponent,
    ThemedSelectComponent,
    ItemDisplayInspectorComponent,
    InventoryStorageInspectorComponent,
    DecoratedPotInspectorComponent,
  ],
  templateUrl: './selection-inspector.component.html',
  styleUrl: './selection-inspector.component.scss',
})
export class SelectionInspectorComponent {
  readonly selectAllRequested = output<void>();
  readonly clearSelectionRequested = output<void>();
  protected readonly i18n = inject(I18nService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly selection = inject(SelectionService);
  protected readonly decorations = inject(DecorationService);
  private readonly library = inject(BlockLibraryService);
  private readonly editor = inject(StructureEditorService);
  private readonly blockIndex = inject(ProjectBlockRuntimeIndex);
  protected readonly stateFeedback = signal('');
  protected readonly selectedDecoration = this.decorations.selected;
  protected readonly hasAnySelection = computed(
    () => !!this.selectedDecoration() || this.selection.kind() !== 'none',
  );
  protected readonly selectedBlock = computed(() => {
    const project = this.workspace.project();
    const selected = this.selection.single();
    if (!project || !selected) return undefined;
    this.blockIndex.ensure(project);
    return this.blockIndex.get(selected);
  });
  protected readonly stateEntries = computed(() =>
    Object.entries(this.selectedBlock()?.state ?? {}),
  );
  protected readonly selectedDefinition = computed(() => {
    const block = this.selectedBlock();
    return block ? this.library.get(block.id) : undefined;
  });
  protected readonly stateProperties = computed<readonly ContentPropertyDescriptor[]>(() => {
    const block = this.selectedBlock();
    const definition = this.selectedDefinition();
    if (!block || !definition) return [];
    const properties = new Map(
      (
        definition.contentDescriptor?.properties ??
        definition.stateDefinitions.map((state) => ({
          name: state.name,
          values: state.values,
          derived: state.derived === true,
          provenance: 'unknown' as const,
          effects: {
            visual: false,
            placement: false,
            behavior: false,
            attachment: false,
            connection: false,
            itemDisplay: false,
            runtimeUnknown: true,
          },
          evidence: [] as readonly string[],
        }))
      ).map((property) => [property.name, property]),
    );
    for (const [name, value] of Object.entries(block.state)) {
      const current = properties.get(name);
      if (!current)
        properties.set(name, {
          name,
          values: [value],
          defaultValue: value,
          derived: false,
          provenance: 'unknown',
          effects: {
            visual: false,
            placement: false,
            behavior: false,
            attachment: false,
            connection: false,
            itemDisplay: false,
            runtimeUnknown: true,
          },
          evidence: ['Preserved from project state without static schema evidence.'],
        });
      else if (!current.values.includes(value))
        properties.set(name, {
          ...current,
          values: [...current.values, value].sort(),
          evidence: [
            ...current.evidence,
            'Current project value is outside the known static value set.',
          ],
        });
    }
    return [...properties.values()].sort((left, right) => left.name.localeCompare(right.name));
  });
  protected readonly selectedBlockIsSign = computed(() => {
    const block = this.selectedBlock();
    return !!block && (isSignDefinition(this.library.get(block.id)) || isSignId(block.id));
  });
  protected readonly selectedItemCapability = computed(() => {
    const definition = this.selectedDefinition();
    return (
      blockCapability(definition, 'item-storage-display') ??
      blockCapability(definition, 'item-display')
    );
  });
  protected readonly selectedInventorySchema = computed(() => {
    const block = this.selectedBlock();
    return block ? verifiedInventoryContainerSchema(block.id) : undefined;
  });
  protected readonly selectedDecoratedPot = computed(() => {
    const block = this.selectedBlock();
    return (
      !!block &&
      (block.id === DECORATED_POT_ID ||
        blockCapability(this.selectedDefinition(), 'block-entity')?.entityKind === 'decorated-pot')
    );
  });
  protected readonly selectedBlockLocked = computed(() => {
    const project = this.workspace.project();
    const block = this.selectedBlock();
    return !!project && !!block && isBlockLocked(block, project.groups);
  });
  protected readonly selectedGroupNames = computed(() => {
    const project = this.workspace.project();
    const block = this.selectedBlock();
    return project && block ? blockGroupNames(block, project) : [];
  });
  protected readonly selectedBlockCount = computed(() => {
    const project = this.workspace.project();
    return project ? this.selection.count(project) : 0;
  });
  protected readonly selectedBounds = computed(() =>
    this.selection.bounds(this.workspace.project()),
  );
  constructor() {
    effect(() => {
      this.selectedBlock();
      this.selectedDecoration();
      this.selection.kind();
      this.stateFeedback.set('');
    });
  }
  protected stateOptions(values: readonly string[]): readonly ThemedSelectOption[] {
    return values.map((value) => ({ id: value, label: this.i18n.stateValue(value) }));
  }
  protected propertyEffects(property: ContentPropertyDescriptor): string[] {
    const labels: string[] = [];
    if (property.effects.visual) labels.push(this.i18n.t('propertyVisual'));
    if (property.effects.behavior) labels.push(this.i18n.t('propertyBehavior'));
    if (property.effects.placement) labels.push(this.i18n.t('propertyPlacement'));
    if (property.derived) labels.push(this.i18n.t('propertyDerived'));
    if (property.effects.runtimeUnknown) labels.push(this.i18n.t('propertyRuntimeUnknown'));
    return labels;
  }
  protected updateSelectedStateValue(property: string, value: string): void {
    const selected = this.selection.single();
    if (!selected || !this.editor.updateBlockState(selected, property, value))
      this.stateFeedback.set('stateEditUnsupported');
    else this.stateFeedback.set('');
  }
  protected rotateSelected(): void {
    const selected = this.selection.single();
    if (!selected || !this.editor.rotateBlock(selected))
      this.stateFeedback.set('rotationUnsupported');
    else this.stateFeedback.set('');
  }
  protected feedbackLabel(): string {
    const key = this.stateFeedback();
    return key ? this.i18n.t(key as 'stateEditUnsupported' | 'rotationUnsupported') : '';
  }
}
