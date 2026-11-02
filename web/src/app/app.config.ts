import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // View Transitions API: transição nativa entre páginas; query params viram input() (?cat=, ?m=)
    provideRouter(routes, withViewTransitions({ skipInitialTransition: true }), withComponentInputBinding()),
  ],
};
