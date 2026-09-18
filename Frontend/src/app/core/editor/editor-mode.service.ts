import { Injectable, signal } from '@angular/core';

export type EditorMode = '3d' | 'y-layer';

@Injectable({ providedIn: 'root' })
export class EditorModeService { readonly mode = signal<EditorMode>('3d'); }
