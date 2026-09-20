import { Component, computed, inject, signal } from '@angular/core';
import { coordinateKey } from '../../../../core/domain/coordinates';
import { isSignId, signData, signLineWidth, StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { WorkspaceStateService } from '../../../../core/ui/workspace-state.service';
import { I18nService } from '../../../../core/ui/i18n.service';
import { signTextMetrics } from '../../../../core/block-entities/sign/sign-text-metrics';
import { SignTextSideService } from '../../../../core/block-entities/sign/sign-text-side.service';
import { vanillaSignColors } from '../../../../core/block-entities/sign/sign-nbt';
import { BlockLibraryService } from '../../../../core/blocks/block-library.service';
import type { SignSide } from '../../../../core/domain/project.types';
import { ThemedSelectComponent, ThemedSelectOption } from '../../../../shared/ui/themed-select/themed-select.component';

@Component({ selector: 'app-sign-inspector', imports: [ThemedSelectComponent], templateUrl: './sign-inspector.component.html', styleUrl: './sign-inspector.component.scss' })
export class SignInspectorComponent {
  private readonly workspace = inject(WorkspaceStateService); private readonly selection = inject(SelectionService); private readonly editor = inject(StructureEditorService); private readonly library = inject(BlockLibraryService);
  protected readonly i18n = inject(I18nService);
  private readonly signTextSide = inject(SignTextSideService);
  protected readonly side = this.signTextSide.side;
  protected readonly draft = signal<SignSide['lines'] | undefined>(undefined);
  protected readonly colors = vanillaSignColors();
  protected readonly selected = computed(() => { const project = this.workspace.project(); const position = this.selection.single(); const block = project && position ? project.blocks.find((entry) => coordinateKey(entry.position) === coordinateKey(position)) : undefined; return block && isSignId(block.id) ? block : undefined; });
  protected readonly data = computed(() => signData(this.selected()?.blockEntityData));
  protected readonly definition = computed(() => { const block = this.selected(); return block ? this.library.get(block.id) : undefined; });
  protected readonly placementStates = computed(() => (this.definition()?.stateDefinitions ?? []).filter((state) => state.name === 'rotation' || state.name === 'facing'));
  protected readonly advancedStates = computed(() => (this.definition()?.stateDefinitions ?? []).filter((state) => state.name === 'waterlogged' || state.name === 'attached'));
  protected readonly colorOptions = computed<readonly ThemedSelectOption[]>(() => this.colors.map((value) => ({ id: value, label: this.colorLabel(value) })));
  protected line(index: number): string { return (this.draft() ?? this.data()[this.side()].lines)[index] ?? ''; }
  protected lineLabel(index: number): string { return this.i18n.t('signTextInput').replace('{line}', String(index + 1)); }
  protected warning(): string | undefined { const line = this.data()[this.side()].lines.findIndex((value) => signLineWidth(value) > this.maxTextWidth()); return line >= 0 ? this.i18n.t('signLineTooWide').replace('{line}', String(line + 1)) : undefined; }
  protected beginEdit(): void { this.draft.set(this.data()[this.side()].lines); }
  protected updateLine(index: number, event: Event): void { const current = [...(this.draft() ?? this.data()[this.side()].lines)] as [...SignSide['lines']]; current[index] = (event.target as HTMLInputElement).value; this.draft.set(current); }
  protected commit(): void { const position = this.selected()?.position; const value = this.draft(); if (position && value !== undefined) this.editor.updateSignText(position, this.side(), value.join('\n')); this.draft.set(undefined); }
  protected selectSide(side: 'front' | 'back'): void { this.commit(); this.signTextSide.set(side); }
  protected color(): string { return this.data()[this.side()].color; }
  protected colorLabel(value: string): string { return this.i18n.signColorLabel(value); }
  protected glowing(): boolean { return this.data()[this.side()].glowing; }
  protected waxed(): boolean { return this.data().waxed; }
  protected updateColor(event: Event): void { const position = this.selected()?.position; if (position) this.editor.updateSignAppearance(position, this.side(), { color: (event.target as HTMLSelectElement).value }); }
  protected updateColorValue(value: string): void { const position = this.selected()?.position; if (position) this.editor.updateSignAppearance(position, this.side(), { color: value }); }
  protected updateGlowing(event: Event): void { const position = this.selected()?.position; if (position) this.editor.updateSignAppearance(position, this.side(), { glowing: (event.target as HTMLInputElement).checked }); }
  protected updateWaxed(event: Event): void { const position = this.selected()?.position; if (position) this.editor.updateSignWaxed(position, (event.target as HTMLInputElement).checked); }
  protected updateState(property: string, event: Event): void { const position = this.selected()?.position; if (position) this.editor.updateBlockState(position, property, (event.target as HTMLSelectElement).value); }
  protected updateStateValue(property: string, value: string): void { const position = this.selected()?.position; if (position) this.editor.updateBlockState(position, property, value); }
  protected stateOptions(state: { readonly values: readonly string[]; readonly name: string }): readonly ThemedSelectOption[] { return state.values.map((value) => ({ id: value, label: this.stateValue(value, state.name) })); }
  protected stateValue(value: string, property: string): string { if (property === 'rotation') return `${value} · ${Number(value) * 22.5}°`; return this.i18n.stateValue(value); }
  protected rotateSign(): void { const position = this.selected()?.position; if (position) this.editor.rotateBlock(position); }
  private maxTextWidth(): number { return signTextMetrics(this.selected()?.id ?? '').maxWidth; }
}
