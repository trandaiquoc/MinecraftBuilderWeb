import { Component, computed, inject, signal } from '@angular/core';
import { coordinateKey } from '../../core/domain/coordinates';
import { isSignId, signData, signLineWidth, StructureEditorService } from '../../core/editor/structure-editor.service';
import { SelectionService } from '../../core/editor/selection.service';
import { WorkspaceStateService } from '../../core/ui/workspace-state.service';
import { I18nService } from '../../core/ui/i18n.service';
import { signTextMetrics } from '../../core/editor/sign-text-metrics';
import { SignTextSideService } from '../../core/editor/sign-text-side.service';

@Component({ selector: 'app-sign-inspector', templateUrl: './sign-inspector.component.html', styleUrl: './sign-inspector.component.scss' })
export class SignInspectorComponent {
  private readonly workspace = inject(WorkspaceStateService); private readonly selection = inject(SelectionService); private readonly editor = inject(StructureEditorService);
  protected readonly i18n = inject(I18nService);
  private readonly signTextSide = inject(SignTextSideService);
  protected readonly side = this.signTextSide.side;
  protected readonly advanced = signal(false);
  protected readonly draft = signal<string | undefined>(undefined);
  protected readonly selected = computed(() => { const project = this.workspace.project(); const position = this.selection.single(); const block = project && position ? project.blocks.find((entry) => coordinateKey(entry.position) === coordinateKey(position)) : undefined; return block && isSignId(block.id) ? block : undefined; });
  protected readonly data = computed(() => signData(this.selected()?.blockEntityData));
  protected text(): string { return this.draft() ?? this.data()[this.side()].lines.join('\n'); }
  protected warning(): string | undefined { const line = this.data()[this.side()].lines.findIndex((value) => signLineWidth(value) > this.maxTextWidth()); return line >= 0 ? this.i18n.t('signLineTooWide').replace('{line}', String(line + 1)) : undefined; }
  protected beginEdit(): void { this.draft.set(this.data()[this.side()].lines.join('\n')); }
  protected updateDraft(event: Event): void { this.draft.set((event.target as HTMLTextAreaElement).value); }
  protected commit(): void { const position = this.selected()?.position; const value = this.draft(); if (position && value !== undefined) this.editor.updateSignText(position, this.side(), value); this.draft.set(undefined); }
  protected toggleSide(): void { this.commit(); this.signTextSide.toggle(); }
  protected sideLabel(): string { return this.i18n.t(this.side() === 'front' ? 'signFront' : 'signBack'); }
  private maxTextWidth(): number { return signTextMetrics(this.selected()?.id ?? '').maxWidth; }
}
