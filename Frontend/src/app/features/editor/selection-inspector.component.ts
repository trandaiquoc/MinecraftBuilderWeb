import { Component, computed, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/editor/selection.service';
import { StructureEditorService, isSignId } from '../../core/editor/structure-editor.service';
import { BlockLibraryService } from '../../core/blocks/block-library.service';
import { DecorationService } from '../../core/decorations/decoration.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { I18nService } from '../../core/ui/i18n.service';
import { blockGroupNames } from '../../core/editor/group-membership';
import { coordinateKey } from '../../core/domain/coordinates';
import { DecorationInspectorComponent } from './decoration-inspector.component';
import { SignInspectorComponent } from './sign-inspector.component';
import { ThemedSelectComponent, ThemedSelectOption } from '../../shared/themed-select.component';

@Component({ selector: 'app-selection-inspector', imports: [DecorationInspectorComponent, SignInspectorComponent, ThemedSelectComponent], templateUrl: './selection-inspector.component.html', styleUrl: './selection-inspector.component.scss' })
export class SelectionInspectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly workspace = inject(WorkspaceStateService);
  protected readonly selection = inject(SelectionService);
  protected readonly decorations = inject(DecorationService);
  private readonly library = inject(BlockLibraryService);
  private readonly editor = inject(StructureEditorService);
  protected readonly stateFeedback = signal('');
  protected readonly selectedDecoration = this.decorations.selected;
  protected readonly selectedBlock = computed(() => { const project = this.workspace.project(); const selected = this.selection.single(); return project && selected ? project.blocks.find((block) => coordinateKey(block.position) === coordinateKey(selected)) : undefined; });
  protected readonly stateEntries = computed(() => Object.entries(this.selectedBlock()?.state ?? {}));
  protected readonly selectedDefinition = computed(() => { const block = this.selectedBlock(); return block ? this.library.get(block.id) : undefined; });
  protected readonly selectedBlockIsSign = computed(() => { const block = this.selectedBlock(); return !!block && isSignId(block.id); });
  protected readonly selectedGroupNames = computed(() => { const project = this.workspace.project(); const block = this.selectedBlock(); return project && block ? blockGroupNames(block, project) : []; });
  protected readonly selectedBlockCount = computed(() => { const project = this.workspace.project(); const box = this.selection.box(); return project && box ? project.blocks.filter((block) => block.position.x >= box.min.x && block.position.x <= box.max.x && block.position.y >= box.min.y && block.position.y <= box.max.y && block.position.z >= box.min.z && block.position.z <= box.max.z).length : 0; });
  protected stateOptions(values: readonly string[]): readonly ThemedSelectOption[] { return values.map((value) => ({ id: value, label: this.i18n.stateValue(value) })); }
  protected updateSelectedStateValue(property: string, value: string): void { const selected = this.selection.single(); if (!selected || !this.editor.updateBlockState(selected, property, value)) this.stateFeedback.set('stateEditUnsupported'); else this.stateFeedback.set(''); }
  protected rotateSelected(): void { const selected = this.selection.single(); if (!selected || !this.editor.rotateBlock(selected)) this.stateFeedback.set('rotationUnsupported'); else this.stateFeedback.set(''); }
  protected feedbackLabel(): string { const key = this.stateFeedback(); return key ? this.i18n.t(key as 'stateEditUnsupported' | 'rotationUnsupported') : ''; }
}
