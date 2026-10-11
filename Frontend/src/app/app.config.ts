import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { IndexedDbProjectStore } from './core/persistence/project-store/indexeddb-project-store';
import { PROJECT_STORE } from './core/persistence/project-store/project-store.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: PROJECT_STORE, useFactory: () => new IndexedDbProjectStore() },
  ],
};
