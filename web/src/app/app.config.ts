import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PreloadAllModules, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        // query params viram input() (?cat=, ?m=)
        // sem withViewTransitions (a captura + transição atrasava cada troca de tela); telas pré-carregadas = primeiro toque sem download
        provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    ],
};
