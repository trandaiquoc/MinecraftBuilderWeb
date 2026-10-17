import { Component, computed, inject, input } from '@angular/core';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { EditorTool } from '../../../../core/editor/state/tool.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';

type ViewportEmptyGuidance =
  | {
      readonly kind: 'choose';
      readonly hint: 'viewportEmptyChooseBlockHint';
      readonly nextStep: 'viewportEmptyNextChoose';
    }
  | {
      readonly kind: 'place';
      readonly hint: 'viewportEmptySelectedItemHint';
      readonly nextStep: 'viewportEmptyNextPlace';
    }
  | {
      readonly kind: 'support';
      readonly hint: 'viewportEmptySupportHint';
      readonly nextStep: 'viewportEmptyNextSupport';
    }
  | {
      readonly kind: 'select';
      readonly hint: 'viewportEmptySelectHint';
      readonly nextStep: 'viewportEmptyNextSwitch';
    };

@Component({
  selector: 'app-viewport-empty-state',
  templateUrl: './viewport-empty-state.component.html',
  styleUrl: './viewport-empty-state.component.scss',
})
export class ViewportEmptyStateComponent {
  readonly project = input<Pick<ProjectDocument, 'blocks' | 'decorations'> | undefined>();
  readonly tool = input<EditorTool>('place');
  readonly hasActiveBlock = input(false);
  readonly hasActiveDecoration = input(false);

  protected readonly i18n = inject(I18nService);
  protected readonly guidance = computed<ViewportEmptyGuidance | undefined>(() => {
    const project = this.project();
    if (!project || project.blocks.length > 0 || (project.decorations?.length ?? 0) > 0)
      return undefined;

    if (this.tool() === 'select') {
      return {
        kind: 'select',
        hint: 'viewportEmptySelectHint',
        nextStep: 'viewportEmptyNextSwitch',
      };
    }

    if (this.hasActiveDecoration()) {
      return {
        kind: 'support',
        hint: 'viewportEmptySupportHint',
        nextStep: 'viewportEmptyNextSupport',
      };
    }

    if (this.hasActiveBlock()) {
      return {
        kind: 'place',
        hint: 'viewportEmptySelectedItemHint',
        nextStep: 'viewportEmptyNextPlace',
      };
    }

    return {
      kind: 'choose',
      hint: 'viewportEmptyChooseBlockHint',
      nextStep: 'viewportEmptyNextChoose',
    };
  });
}
