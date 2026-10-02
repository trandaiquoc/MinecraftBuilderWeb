import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-readonly-code-viewer',
  templateUrl: './readonly-code-viewer.component.html',
  styleUrl: './readonly-code-viewer.component.scss',
})
export class ReadonlyCodeViewerComponent {
  readonly value = input('');
  readonly label = input('Code viewer');
  readonly lineCountLabel = input('');
  readonly lines = computed(() => this.value().split('\n'));
}
