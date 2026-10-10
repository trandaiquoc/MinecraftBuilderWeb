import { Routes } from '@angular/router';
import { ProjectScreenComponent } from './features/projects/project-screen/project-screen.component';
import { editorCanDeactivate } from './core/persistence/editor-leave-coordinator.service';

export const routes: Routes = [
  { path: '', component: ProjectScreenComponent },
  {
    path: 'editor',
    loadComponent: () =>
      import('./features/editor/shell/editor-shell.component').then(
        ({ EditorShellComponent }) => EditorShellComponent,
      ),
    canDeactivate: [editorCanDeactivate],
  },
  { path: '**', redirectTo: '' },
];
