import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'lancamentos', loadComponent: () => import('./pages/transactions').then((m) => m.Transactions) },
  { path: 'cartoes', loadComponent: () => import('./pages/cards').then((m) => m.Cards) },
  { path: 'relatorios', loadComponent: () => import('./pages/reports').then((m) => m.Reports) },
  { path: 'limites', loadComponent: () => import('./pages/budgets').then((m) => m.Budgets) },
  { path: 'notificacoes', loadComponent: () => import('./pages/inbox').then((m) => m.Inbox) },
  { path: 'ajustes', loadComponent: () => import('./pages/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: '' },
];
