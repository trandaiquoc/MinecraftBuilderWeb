import { Component, input, output } from '@angular/core';
import { LucidePlus } from '@lucide/angular';
import { UiTooltipDirective } from './ui-tooltip.directive';

export interface ContentSourceOption {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
  readonly tooltip?: string;
}

@Component({
  selector: 'app-content-source-selector',
  imports: [LucidePlus, UiTooltipDirective],
  templateUrl: './content-source-selector.component.html',
  styleUrl: './content-source-selector.component.scss',
})
export class ContentSourceSelectorComponent {
  readonly sources = input<readonly ContentSourceOption[]>([]);
  readonly selectedId = input<string | undefined>();
  readonly label = input('Content source');
  readonly manageLabel = input('Manage sources');
  readonly selectionChange = output<string>();
  readonly manageRequested = output<void>();
}
