import { Injectable, computed, inject } from '@angular/core';
import { UiPreferencesService } from '../../ui/ui-preferences.service';
import { KeyboardAction, keyboardActionForEvent } from './keyboard-bindings';
import { MouseAction, mouseActionForEvent } from './mouse-bindings';

@Injectable({ providedIn: 'root' })
export class KeyboardBindingService {
  private readonly preferences = inject(UiPreferencesService);
  readonly bindings = computed(() => this.preferences.preferences().shortcuts);
  readonly mouseBindings = computed(() => this.preferences.preferences().mouseBindings);
  actionForEvent(event: { readonly key: string; readonly code?: string; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean; readonly target: EventTarget | null }): KeyboardAction | undefined { return keyboardActionForEvent(event, this.bindings()); }
  mouseActionForEvent(event: { readonly button?: number; readonly deltaY?: number; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean }): MouseAction | undefined { return mouseActionForEvent(event, this.mouseBindings()); }
}
