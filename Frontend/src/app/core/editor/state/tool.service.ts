import { Injectable, signal } from '@angular/core';

export type EditorTool = 'place' | 'select';

@Injectable({ providedIn: 'root' })
export class EditorToolService { readonly active = signal<EditorTool>('place'); }
