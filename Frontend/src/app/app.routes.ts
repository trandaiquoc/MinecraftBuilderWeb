import { Routes } from '@angular/router';
import { EditorShellComponent } from './features/editor/shell/editor-shell.component';
import { ProjectScreenComponent } from './features/projects/project-screen.component';

export const routes: Routes = [{ path: '', component: ProjectScreenComponent }, { path: 'editor', component: EditorShellComponent }, { path: '**', redirectTo: '' }];
