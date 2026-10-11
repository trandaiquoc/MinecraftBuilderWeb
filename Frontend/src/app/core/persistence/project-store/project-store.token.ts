import { InjectionToken } from '@angular/core';
import type { ProjectStore } from './project-store.port';

export const PROJECT_STORE = new InjectionToken<ProjectStore>('PROJECT_STORE');
