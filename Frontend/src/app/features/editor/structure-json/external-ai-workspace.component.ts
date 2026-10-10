import { Component, computed, inject, input, signal } from '@angular/core';
import { LucideCopy } from '@lucide/angular';
import { canonicalPlaceableItemId } from '../../../core/blocks/placement-palette/placeable-item-resolution';
import type { PlaceableItemDefinition } from '../../../core/blocks/placement-palette/placeable-item.types';
import { PaintingVariantCatalogService } from '../../../core/decorations/catalog/painting-variant-catalog.service';
import type { PaintingVariant } from '../../../core/decorations/decoration.types';
import type { ProjectDocument } from '../../../core/domain/project.types';
import { ExternalAiPromptContextService } from '../../../core/persistence/structure-json/external-ai-prompt-context.service';
import {
  buildExternalAiPrompt,
  externalAiInstructionSections,
  resolveModSelections,
  selectedExternalAiTotals,
} from '../../../core/persistence/structure-json/external-ai-prompt-builder';
import type {
  ExternalAiModContentCategory,
  ExternalAiModContentSelection,
  ExternalAiPromptLocale,
  ExternalAiPromptOptions,
} from '../../../core/persistence/structure-json/external-ai-prompt-builder';
import {
  ExternalAiContentCategory,
  ExternalAiContentLimits,
  serializeExternalAiContentLimits,
} from '../../../core/persistence/structure-json/external-ai-content-limits';
import { ItemCatalogService } from '../../../core/items/catalog/item-catalog.service';
import {
  createStructureJsonExample,
  serializeStructureJsonValue,
} from '../../../core/persistence/structure-json/structure-json';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../core/ui/preferences/ui-preferences.service';
import { ReadonlyCodeViewerComponent } from '../../../shared/ui/readonly-code-viewer/readonly-code-viewer.component';

type AiWorkspaceTab = 'description' | 'content' | 'limits' | 'guidance' | 'example';

@Component({
  selector: 'app-external-ai-workspace',
  imports: [LucideCopy, ReadonlyCodeViewerComponent],
  templateUrl: './external-ai-workspace.component.html',
  styleUrl: './external-ai-workspace.component.scss',
})
export class ExternalAiWorkspaceComponent {
  protected readonly i18n = inject(I18nService);
  private readonly itemCatalog = inject(ItemCatalogService);
  private readonly paintingCatalog = inject(PaintingVariantCatalogService);
  private readonly aiContext = inject(ExternalAiPromptContextService);
  protected readonly preferences = inject(UiPreferencesService);
  readonly project = input.required<ProjectDocument>();
  readonly placeableItems = input.required<readonly PlaceableItemDefinition[]>();
  readonly contentLimits = input.required<ExternalAiContentLimits>();
  readonly active = input(false);

  protected readonly activeAiTab = signal<AiWorkspaceTab>('description');
  protected readonly aiDescription = signal('');
  protected readonly includeAiGuidance = signal(true);
  protected readonly includeAvailableContentOverride = signal<boolean | undefined>(undefined);
  protected readonly includeJsonExample = signal(true);
  protected readonly modSelections = signal<readonly ExternalAiModContentSelection[]>([]);
  protected readonly modContentOpen = signal(false);
  protected readonly contentSearch = signal('');
  protected readonly contentLimitsCategory = signal<ExternalAiContentCategory>('blocks');
  protected readonly aiCopyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly aiDescriptionInvalid = signal(false);
  protected readonly aiTabs: readonly AiWorkspaceTab[] = [
    'description',
    'content',
    'limits',
    'guidance',
    'example',
  ];
  protected readonly contentCategories: readonly ExternalAiContentCategory[] = [
    'blocks',
    'items',
    'decorations',
  ];
  protected readonly modCategories: readonly ExternalAiModContentCategory[] = [
    'blocks',
    'items',
    'decorations',
  ];

  protected readonly aiSnapshot = computed(() => this.aiContext.snapshot(this.project()));
  protected readonly hasExternalContent = computed(() =>
    this.aiSnapshot().mods.some(
      (mod) => mod.blocks.length > 0 || mod.items.length > 0 || mod.decorations.length > 0,
    ),
  );
  protected readonly includeAvailableContent = computed(
    () => this.includeAvailableContentOverride() ?? this.hasExternalContent(),
  );
  protected readonly effectiveModSelections = computed(() =>
    resolveModSelections(this.aiSnapshot(), this.modSelections()),
  );
  protected readonly selectedTotals = computed(() =>
    selectedExternalAiTotals(this.aiSnapshot(), this.modSelections()),
  );
  protected readonly aiPromptOptions = computed<ExternalAiPromptOptions>(() => ({
    locale: this.currentAiLocale(),
    includeGuidance: this.includeAiGuidance(),
    includeAvailableContent: this.includeAvailableContent(),
    includeExample: this.includeJsonExample(),
    modSelections: this.modSelections(),
    contentLimits: this.contentLimits(),
    contentLimitsEnabled: this.preferences.preferences().externalAiContentLimitsEnabled,
  }));
  protected readonly contentCatalogEntries = computed<
    readonly {
      category: ExternalAiContentCategory;
      id: string;
      displayName?: string;
      sourceId?: string;
      sourceName?: string;
    }[]
  >(() => {
    const blocks = this.placeableItems().map((item) => ({
      category: 'blocks' as const,
      id: item.itemId,
      displayName: item.displayName,
      sourceId: item.sourceId ?? item.namespace,
      sourceName: item.sourceName,
    }));
    const items = this.itemCatalog.all().map((item) => ({
      category: 'items' as const,
      id: item.id,
      displayName: item.displayName,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
    }));
    const decorations = this.paintingCatalog.placeable().map((painting) => ({
      category: 'decorations' as const,
      id: namespacedDecorationId(painting),
      displayName: paintingDisplayName(painting),
      sourceId: painting.sourceId ?? 'vanilla',
      sourceName: painting.sourceName,
    }));
    return [...blocks, ...items, ...decorations];
  });
  protected readonly contentLimitsJson = computed(() =>
    serializeExternalAiContentLimits(this.contentLimits()),
  );
  protected readonly contentCandidates = computed(() => {
    const query = this.contentSearch();
    const normalized = query
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .trim();
    return this.contentCatalogEntries()
      .filter(
        (entry) =>
          entry.category === this.contentLimitsCategory() &&
          (!normalized ||
            `${entry.displayName ?? ''} ${entry.id} ${entry.sourceName ?? ''}`
              .toLocaleLowerCase()
              .includes(normalized)),
      )
      .slice(0, 40);
  });
  protected readonly aiPrompt = computed(() =>
    buildExternalAiPrompt(this.aiDescription(), this.aiSnapshot(), this.aiPromptOptions()),
  );
  protected readonly aiExample = computed(() =>
    serializeStructureJsonValue(createStructureJsonExample()),
  );
  protected readonly aiGuidance = computed(() =>
    externalAiInstructionSections(
      this.aiSnapshot().minecraftVersion,
      this.currentAiLocale(),
      this.aiSnapshot().projectContext,
    ),
  );

  closeContentSelector(): boolean {
    if (!this.modContentOpen()) return false;
    this.modContentOpen.set(false);
    return true;
  }

  protected setAiTab(tab: AiWorkspaceTab): void {
    this.activeAiTab.set(tab);
  }
  protected aiTabLabel(tab: AiWorkspaceTab): string {
    return this.i18n.t(
      (
        {
          description: 'structureJsonAiTabDescription',
          content: 'structureJsonAiTabContent',
          limits: 'structureJsonAiTabContentLimits',
          guidance: 'structureJsonAiTabGuidance',
          example: 'structureJsonAiTabExample',
        } as const
      )[tab],
    );
  }
  protected aiGuidanceLines(section: { readonly lines: readonly string[] }): readonly string[] {
    return section.lines;
  }
  protected onAiTabKeydown(event: KeyboardEvent): void {
    const current = this.aiTabs.indexOf(this.activeAiTab());
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (current + 1) % this.aiTabs.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (current - 1 + this.aiTabs.length) % this.aiTabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? this.aiTabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.setAiTab(this.aiTabs[next]);
  }
  protected setAiDescription(value: string): void {
    this.aiDescription.set(value);
    this.aiCopyStatus.set('idle');
    this.aiDescriptionInvalid.set(false);
  }
  protected setIncludeGuidance(value: boolean): void {
    this.includeAiGuidance.set(value);
    this.aiCopyStatus.set('idle');
  }
  protected setIncludeAvailableContent(value: boolean): void {
    this.includeAvailableContentOverride.set(value);
    this.aiCopyStatus.set('idle');
  }
  protected setIncludeJsonExample(value: boolean): void {
    this.includeJsonExample.set(value);
    this.aiCopyStatus.set('idle');
  }
  protected toggleModContent(): void {
    if (this.hasExternalContent() && this.includeAvailableContent())
      this.modContentOpen.update((open) => !open);
  }
  protected modSelection(sourceId: string): ExternalAiModContentSelection {
    return (
      this.effectiveModSelections().find((selection) => selection.sourceId === sourceId) ?? {
        sourceId,
        includeBlocks: false,
        includeItems: false,
        includeDecorations: false,
      }
    );
  }
  protected categoryKey(
    category: ExternalAiModContentCategory,
  ): 'includeBlocks' | 'includeItems' | 'includeDecorations' {
    return categoryKey(category);
  }
  protected setModCategory(
    sourceId: string,
    category: ExternalAiModContentCategory,
    value: boolean,
  ): void {
    const selections = this.effectiveModSelections().map((selection) =>
      selection.sourceId === sourceId
        ? { ...selection, [categoryKey(category)]: value }
        : selection,
    );
    this.modSelections.set(selections);
    this.aiCopyStatus.set('idle');
  }
  protected selectAllModContent(): void {
    this.modSelections.set(
      this.aiSnapshot().mods.map((mod) => ({
        sourceId: mod.sourceId,
        includeBlocks: mod.blocks.length > 0,
        includeItems: mod.items.length > 0,
        includeDecorations: mod.decorations.length > 0,
      })),
    );
    this.aiCopyStatus.set('idle');
  }
  protected clearAllModContent(): void {
    this.modSelections.set(
      this.aiSnapshot().mods.map((mod) => ({
        sourceId: mod.sourceId,
        includeBlocks: false,
        includeItems: false,
        includeDecorations: false,
      })),
    );
    this.aiCopyStatus.set('idle');
  }
  protected setContentSearch(value: string): void {
    this.contentSearch.set(value);
  }
  protected setContentLimitsCategory(category: ExternalAiContentCategory): void {
    this.contentLimitsCategory.set(category);
    this.contentSearch.set('');
  }
  protected setContentLimitsEnabled(value: boolean): void {
    this.preferences.setExternalAiContentLimitsEnabled(value);
    this.aiCopyStatus.set('idle');
  }
  protected contentLimitSelected(candidate: {
    readonly category: ExternalAiContentCategory;
    readonly id: string;
  }): boolean {
    return this.contentLimits()[candidate.category].includes(
      this.canonicalContentId(candidate.category, candidate.id),
    );
  }
  protected toggleContentLimit(
    candidate: { readonly category: ExternalAiContentCategory; readonly id: string },
    selected: boolean,
  ): void {
    const category = candidate.category;
    const id = this.canonicalContentId(category, candidate.id);
    const next = {
      ...this.contentLimits(),
      [category]: selected
        ? [...this.contentLimits()[category], id]
        : this.contentLimits()[category].filter((entry) => entry !== id),
    };
    this.preferences.setExternalAiContentLimits(next);
    this.aiCopyStatus.set('idle');
  }
  protected clearContentLimits(): void {
    this.preferences.setExternalAiContentLimits({ blocks: [], items: [], decorations: [] });
    this.aiCopyStatus.set('idle');
  }
  protected resetContentLimits(): void {
    this.preferences.resetExternalAiContentLimits();
    this.aiCopyStatus.set('idle');
  }
  protected contentCategoryLabel(category: ExternalAiContentCategory): string {
    return this.i18n.t(
      (
        {
          blocks: 'structureJsonAiContentLimitsBlocks',
          items: 'structureJsonAiContentLimitsItems',
          decorations: 'structureJsonAiContentLimitsDecorations',
        } as const
      )[category],
    );
  }
  protected modContentSummary(): string {
    const totals = this.selectedTotals();
    if (!totals.mods) return this.i18n.t('structureJsonAiNoContentSelected');
    const names = this.aiSnapshot()
      .mods.filter(
        (mod) =>
          this.modSelection(mod.sourceId).includeBlocks ||
          this.modSelection(mod.sourceId).includeItems ||
          this.modSelection(mod.sourceId).includeDecorations,
      )
      .map((mod) => mod.name);
    const label = names.length <= 2 ? names.join(' · ') : `${names[0]} +${names.length - 1}`;
    const categories = [
      totals.blocks > 0 ? `${totals.blocks} ${this.i18n.t('structureJsonAiSummaryBlocks')}` : '',
      totals.items > 0 ? `${totals.items} ${this.i18n.t('structureJsonAiSummaryItems')}` : '',
      totals.decorations > 0
        ? `${totals.decorations} ${this.i18n.t('structureJsonAiSummaryDecorations')}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `${label} · ${categories}`;
  }
  protected categoryCount(
    mod: {
      readonly blocks: readonly string[];
      readonly items: readonly unknown[];
      readonly decorations: readonly unknown[];
    },
    category: ExternalAiModContentCategory,
  ): number {
    return category === 'blocks'
      ? mod.blocks.length
      : category === 'items'
        ? mod.items.length
        : mod.decorations.length;
  }
  protected categoryLabel(category: ExternalAiModContentCategory): string {
    return this.i18n.t(
      (
        {
          blocks: 'structureJsonAiIncludeBlocks',
          items: 'structureJsonAiIncludeItems',
          decorations: 'structureJsonAiIncludeDecorations',
        } as const
      )[category],
    );
  }
  protected modContentText(mod: {
    readonly blocks: readonly string[];
    readonly items: readonly { readonly id: string; readonly maxStackSize?: number }[];
    readonly decorations: readonly { readonly id: string; readonly kind: string }[];
  }): string {
    const sections: string[] = [];
    if (mod.blocks.length)
      sections.push(
        `${this.i18n.t('structureJsonAiIncludeBlocks')}\n${[...mod.blocks].sort().join('\n')}`,
      );
    if (mod.items.length)
      sections.push(
        `${this.i18n.t('structureJsonAiIncludeItems')}\n${[...mod.items]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((item) =>
            item.maxStackSize === undefined ? item.id : `${item.id} (max ${item.maxStackSize})`,
          )
          .join('\n')}`,
      );
    if (mod.decorations.length)
      sections.push(
        `${this.i18n.t('structureJsonAiIncludeDecorations')}\n${[...mod.decorations]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((item) => `${item.id} [${item.kind}]`)
          .join('\n')}`,
      );
    return sections.join('\n\n');
  }
  protected lineCountLabel(value: string): string {
    return this.i18n
      .t('structureJsonAiLineCount')
      .replace('{count}', String(value === '' ? 0 : value.split('\n').length));
  }
  protected aiPromptSummary(): string {
    const parts = [this.i18n.t('structureJsonAiSummaryDescription')];
    if (this.includeAiGuidance()) parts.push(this.i18n.t('structureJsonAiSummaryGuidance'));
    if (this.includeAvailableContent() && this.selectedTotals().mods > 0)
      parts.push(this.modContentSummary());
    if (
      this.preferences.preferences().externalAiContentLimitsEnabled &&
      (this.contentLimits().blocks.length ||
        this.contentLimits().items.length ||
        this.contentLimits().decorations.length)
    )
      parts.push(this.i18n.t('structureJsonAiIncludeContentLimits'));
    if (this.includeJsonExample()) parts.push(this.i18n.t('structureJsonAiSummaryExample'));
    return `${this.i18n.t('structureJsonAiIncludes')}: ${parts.join(' + ')}`;
  }
  protected async copyAiPrompt(): Promise<void> {
    if (!this.aiDescription().trim()) {
      this.aiDescriptionInvalid.set(true);
      this.aiCopyStatus.set('idle');
      return;
    }
    this.aiDescriptionInvalid.set(false);
    await this.copyText(this.aiPrompt());
  }
  protected async copyAiExample(): Promise<void> {
    await this.copyText(this.aiExample());
  }

  private canonicalContentId(category: ExternalAiContentCategory, id: string): string {
    return category === 'blocks' ? canonicalPlaceableItemId(id, this.placeableItems()) : id;
  }
  private currentAiLocale(): ExternalAiPromptLocale {
    return typeof this.i18n.locale === 'function' ? this.i18n.locale() : 'en';
  }
  private async copyText(value: string): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      this.aiCopyStatus.set('copied');
    } catch {
      this.aiCopyStatus.set('failed');
    }
  }
}

function categoryKey(
  category: ExternalAiModContentCategory,
): 'includeBlocks' | 'includeItems' | 'includeDecorations' {
  return category === 'blocks'
    ? 'includeBlocks'
    : category === 'items'
      ? 'includeItems'
      : 'includeDecorations';
}
function namespacedDecorationId(entry: PaintingVariant): string {
  return entry.id.includes(':') ? entry.id : `minecraft:${entry.id}`;
}
function paintingDisplayName(entry: PaintingVariant): string {
  return entry.id
    .split(':')
    .at(-1)!
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
