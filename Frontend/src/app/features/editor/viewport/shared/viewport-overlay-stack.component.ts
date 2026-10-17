import { Component, inject, input } from '@angular/core';
import type { ProjectDocument } from '../../../../core/domain/project.types';
import type { PlacementStatus } from '../../../../core/editor/placement/placement';
import type { EditorTool } from '../../../../core/editor/state/tool.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { ViewportEmptyStateComponent } from './viewport-empty-state.component';

@Component({
  selector: 'app-viewport-overlay-stack',
  imports: [ViewportEmptyStateComponent],
  templateUrl: './viewport-overlay-stack.component.html',
  styleUrl: './viewport-overlay-stack.component.scss',
})
export class ViewportOverlayStackComponent {
  readonly project = input<Pick<ProjectDocument, 'blocks' | 'decorations'> | undefined>();
  readonly tool = input<EditorTool>('place');
  readonly hasActiveBlock = input(false);
  readonly hasActiveDecoration = input(false);
  readonly placementStatus = input<PlacementStatus>();
  readonly placementReason = input('');
  readonly target = input('');

  protected readonly i18n = inject(I18nService);
}
