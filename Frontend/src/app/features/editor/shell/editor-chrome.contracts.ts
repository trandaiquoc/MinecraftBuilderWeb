import type { EditorBackgroundMode } from '../../../core/editor/appearance/editor-background-contract';
import type { EditorLayoutPreferences } from '../../../core/ui/preferences/editor-layout-preferences.service';
import type { UiLocale } from '../../../core/ui/preferences/ui-preferences.service';
import type { CameraPreset } from '../../../core/editor/camera/camera';

export interface EditorChromeState {
  readonly theme: 'craft' | 'light' | 'dark' | 'raccoon';
  readonly locale: UiLocale;
  readonly background: EditorBackgroundMode;
  readonly layout: EditorLayoutPreferences;
  readonly mode: '3d' | 'y-layer';
  readonly tool: 'place' | 'select';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasSelection: boolean;
  readonly canFocusSelection: boolean;
  readonly deletingProject: boolean;
  readonly projectName: string;
  readonly minecraftVersion: string;
  readonly saveStatusLabel: string;
}

export type EditorChromeAction =
  | { readonly type: 'navigate-projects' }
  | { readonly type: 'save-project' }
  | { readonly type: 'delete-project' }
  | { readonly type: 'import-structure-json' }
  | { readonly type: 'export-structure-json' }
  | { readonly type: 'export-structure-nbt' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'select-all' }
  | { readonly type: 'clear-selection' }
  | { readonly type: 'delete-selection' }
  | { readonly type: 'set-mode'; readonly mode: '3d' | 'y-layer' }
  | {
      readonly type: 'toggle-layout';
      readonly key:
        | 'editorToolbarVisible'
        | 'leftSidebarVisible'
        | 'rightSidebarVisible'
        | 'quickBarVisible'
        | 'statusBarVisible';
    }
  | { readonly type: 'reset-layout' }
  | { readonly type: 'fit-structure' }
  | { readonly type: 'focus-selection' }
  | { readonly type: 'open-asset-manager' }
  | { readonly type: 'open-mod-jar-import' }
  | { readonly type: 'open-diagnostics' }
  | { readonly type: 'open-settings' }
  | { readonly type: 'set-locale'; readonly locale: UiLocale }
  | { readonly type: 'set-theme'; readonly theme: EditorChromeState['theme'] }
  | { readonly type: 'set-background'; readonly background: EditorBackgroundMode }
  | { readonly type: 'open-controls-help' }
  | { readonly type: 'open-about' }
  | { readonly type: 'unavailable-feature' }
  | { readonly type: 'set-tool'; readonly tool: 'place' | 'select' }
  | { readonly type: 'camera-preset'; readonly preset: CameraPreset }
  | { readonly type: 'reset-camera' };
