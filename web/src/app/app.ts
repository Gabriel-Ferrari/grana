import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { env } from '../env';
import { Store, sb, toast } from './core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (!store.ready()) {
      <p class="center muted">Carregando…</p>
    } @else if (!store.session()) {
      <div class="login box">
        <h1 class="logo">grana</h1>
        <p class="muted">Controle financeiro pessoal</p>
        <button class="primary" (click)="google()">Entrar com Google</button>
        @if (!prod) {
          <form (ngSubmit)="devLogin()" class="col">
            <small class="muted">dev local</small>
            <input name="e" [(ngModel)]="email" placeholder="email" />
            <input name="p" [(ngModel)]="pass" type="password" placeholder="senha" />
            <button>Entrar (dev)</button>
          </form>
        }
      </div>
    } @else {
      <header>
        <a routerLink="/" class="logo">grana</a>
        <nav>
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Visão geral</a>
          <a routerLink="/lancamentos" routerLinkActive="on">Lançamentos</a>
          <a routerLink="/cartoes" routerLinkActive="on">Cartões</a>
          <a routerLink="/relatorios" routerLinkActive="on">Relatórios</a>
          <a routerLink="/limites" routerLinkActive="on">Limites</a>
          <a routerLink="/notificacoes" routerLinkActive="on">Notificações @if (store.pending()) {<b class="badge">{{ store.pending() }}</b>}</a>
          <a routerLink="/ajustes" routerLinkActive="on">Ajustes</a>
        </nav>
        <button class="link" (click)="logout()">Sair</button>
      </header>
      @if (toast()) { <div class="toast" (click)="toast.set('')">{{ toast() }}</div> }
      <main><router-outlet /></main>
    }
  `,
})
export class App {
  store = inject(Store);
  toast = toast;
  prod = env.production;
  email = '';
  pass = '';

  google() {
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  }
  async devLogin() {
    const { error } = await sb.auth.signInWithPassword({ email: this.email, password: this.pass });
    if (error) toast.set(error.message);
  }
  logout() {
    sb.auth.signOut();
  }
}
