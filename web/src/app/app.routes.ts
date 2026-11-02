import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', loadComponent: () => import('./features/home/home.page').then((m) => m.Home) },
    { path: 'lancamentos', loadComponent: () => import('./features/transactions/transactions.page').then((m) => m.Transactions) },
    { path: 'cartoes', loadComponent: () => import('./features/cards/cards.page').then((m) => m.Cards) },
    { path: 'relatorios', loadComponent: () => import('./features/reports/reports.page').then((m) => m.Reports) },
    { path: 'limites', loadComponent: () => import('./features/budgets/budgets.page').then((m) => m.Budgets) },
    { path: 'revisar', loadComponent: () => import('./features/review/review.page').then((m) => m.Review) },
    { path: 'notificacoes', loadComponent: () => import('./features/notifications/inbox.page').then((m) => m.Inbox) },
    { path: 'ajustes', loadComponent: () => import('./features/settings/settings.page').then((m) => m.Settings) },
    { path: '**', redirectTo: '' },
];
