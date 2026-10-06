import { Routes } from '@angular/router';
import { EditorShellComponent } from './features/editor/shell/editor-shell.component';
import { ProjectScreenComponent } from './features/projects/project-screen/project-screen.component';
import { editorCanDeactivate } from './core/persistence/editor-leave-coordinator.service';

export const routes: Routes = [{ path: '', component: ProjectScreenComponent }, { path: 'editor', component: EditorShellComponent, canDeactivate: [editorCanDeactivate] }, { path: '**', redirectTo: '' }];
