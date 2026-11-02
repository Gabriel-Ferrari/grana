import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store, Theme, authError, hidden, notify, sb, setTheme, theme, toast, toggleHidden } from './core';
import { Icon } from './icon';
import { TxForm } from './tx-form';
import { pluggySync } from './openfinance';

const NAV = [
  { to: '/', label: 'Início', icon: 'home', exact: true },
  { to: '/lancamentos', label: 'Lançamentos', icon: 'receipt_long' },
  { to: '/cartoes', label: 'Cartões', icon: 'credit_card' },
  { to: '/relatorios', label: 'Relatórios', icon: 'bar_chart' },
  { to: '/limites', label: 'Limites', icon: 'track_changes' },
  { to: '/notificacoes', label: 'Notificações', icon: 'notifications' },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings' },
];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Icon, TxForm],
  template: `
    @if (splash()) {
      <div class="boot" [class.out]="store.ready()" aria-label="Carregando grana"><img src="/icon.svg" alt="" /><b>grana</b><i></i></div>
    }
    @if (!store.ready()) {
    } @else if (!store.session()) {
      <div class="login">
        <section class="login-art">
          <span class="brand"><img src="/icon.svg" alt="" />grana</span>
          <h1>Seu dinheiro, <em>sem planilha.</em></h1>
          <div class="ledger" aria-hidden="true">
            <div><span class="ms">notifications</span>Compra aprovada · Padaria<b>− R$ 18,50</b></div>
            <div><span class="ms">check_circle</span>Lançado em Alimentação<b>auto</b></div>
            <div><span class="ms">payments</span>Pix recebido · Salário<b>+ R$ 2.295,26</b></div>
          </div>
          <p class="muted">Lê as notificações do banco e lança sozinho. Cartões, faturas, limites e relatórios num lugar só.</p>
        </section>
        <section class="login-form">
          <h2>{{ signup ? 'Criar conta' : 'Entrar' }}</h2>
          <p class="muted">Cada conta vê só os próprios dados.</p>
          <button class="google-btn" (click)="google()">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continuar com Google
          </button>
          <div class="or"><span>ou com e-mail</span></div>
          <form (ngSubmit)="signup ? createAccount() : passwordLogin()" class="col" style="gap:.75rem">
            @if (signup) { <label>Seu nome <input name="nm" [(ngModel)]="name" required autocomplete="name" /></label> }
            <label>E-mail <input name="e" type="email" [(ngModel)]="email" required autocomplete="username" inputmode="email" /></label>
            <div class="pw">
              <label>Senha <input name="p" [type]="showPass ? 'text' : 'password'" [(ngModel)]="pass" required [attr.autocomplete]="signup ? 'new-password' : 'current-password'" [attr.minlength]="signup ? 8 : 6" /></label>
              <button type="button" class="btn ghost icon" (click)="showPass = !showPass" [attr.aria-label]="showPass ? 'Esconder senha' : 'Mostrar senha'"><g-icon [name]="showPass ? 'visibility_off' : 'visibility'" [size]="18" /></button>
            </div>
            @if (signup) { <small class="muted">Mínimo de 8 caracteres.</small> }
            <button class="btn primary" style="padding:.8rem" [disabled]="busy"><g-icon [name]="signup ? 'person_add' : 'login'" [size]="18" />{{ signup ? 'Criar conta' : 'Entrar' }}</button>
            @if (!signup) { <button type="button" class="btn ghost" (click)="forgot()" style="align-self:flex-start;font-size:.85rem">Esqueci minha senha</button> }
          </form>
          <p class="muted small">{{ signup ? 'Já tem conta?' : 'Não tem conta?' }}
            <button type="button" class="btn ghost" style="padding:.2rem .4rem;font-size:.85rem;color:var(--brand)" (click)="signup = !signup">{{ signup ? 'Entrar' : 'Criar conta com e-mail' }}</button></p>
        </section>
      </div>
    } @else {
      <header class="top">
        <a routerLink="/" class="brand"><img src="/icon.svg" alt="" />grana</a>
        <nav class="pills" aria-label="Principal">
          @for (n of nav; track n.to) {
            <a [routerLink]="n.to" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!n.exact }">
              <g-icon [name]="n.icon" [size]="19" />{{ n.label }}
              @if (n.to === '/notificacoes' && store.pending()) { <span class="badge">{{ store.pending() }}</span> }
            </a>
          }
        </nav>
        <div class="top-actions">
          <button class="btn ghost icon" (click)="toggleHidden()" [attr.aria-label]="hidden() ? 'Mostrar valores' : 'Ocultar valores'" title="Ocultar valores (H)">
            <g-icon [name]="hidden() ? 'visibility_off' : 'visibility'" />
          </button>
          <button class="btn ghost icon" (click)="cycleTheme()" [attr.aria-label]="'Tema: ' + themeLabel()" [title]="'Tema: ' + themeLabel()">
            <g-icon [name]="theme() === 'dark' ? 'dark_mode' : theme() === 'light' ? 'light_mode' : 'brightness_auto'" />
          </button>
          <button class="btn primary hide-m" (click)="store.open({ kind: 'expense' })" title="Novo lançamento (D, R ou T)"><g-icon name="add" />Novo</button>
          <button class="btn ghost icon" popovertarget="user-menu" aria-label="Conta">
            @if (store.avatar(); as a) { <img class="avatar" [src]="a" alt="" referrerpolicy="no-referrer" /> } @else { <g-icon name="more_horiz" /> }
          </button>
        </div>
      </header>
      <div id="user-menu" popover class="more-menu" style="inset:4rem 1rem auto auto">
        <div class="muted small" style="padding:.5rem .8rem">{{ store.session()?.user?.email }}</div>
        <div class="seg" style="margin:.2rem .6rem .6rem;display:flex" role="radiogroup" aria-label="Tema">
          @for (o of themes; track o.v) {
            <button style="flex:1" role="radio" [attr.aria-checked]="theme() === o.v" [class.on]="theme() === o.v" (click)="setTheme(o.v)"><g-icon [name]="o.icon" [size]="17" />{{ o.label }}</button>
          }
        </div>
        <div class="kbd-hint" style="padding:.2rem .8rem .6rem"><kbd>D</kbd><kbd>R</kbd><kbd>T</kbd> novo · <kbd>H</kbd> ocultar · <kbd>/</kbd> buscar</div>
        <button (click)="logout()"><g-icon name="logout" />Sair</button>
      </div>

      <main><router-outlet /></main>

      <nav class="tabbar" aria-label="Principal">
        @for (n of nav.slice(0, 2); track n.to) {
          <a [routerLink]="n.to" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!n.exact }"><g-icon [name]="n.icon" [size]="24" />{{ n.label }}</a>
        }
        <button class="tab-add" (click)="store.open({ kind: 'expense' })" aria-label="Novo lançamento"><span><g-icon name="add" [size]="30" /></span></button>
        <a [routerLink]="nav[2].to" routerLinkActive="on"><g-icon [name]="nav[2].icon" [size]="24" />{{ nav[2].label }}</a>
        <button popovertarget="more-menu"><g-icon name="more_horiz" [size]="24" />Mais
          @if (store.pending()) { <span class="badge">{{ store.pending() }}</span> }</button>
      </nav>
      <div id="more-menu" popover class="more-menu">
        @for (n of nav.slice(3); track n.to) {
          <a [routerLink]="n.to" (click)="hide('more-menu')"><g-icon [name]="n.icon" />{{ n.label }}
            @if (n.to === '/notificacoes' && store.pending()) { <span class="badge" style="margin-left:auto">{{ store.pending() }}</span> }</a>
        }
        <button (click)="logout()"><g-icon name="logout" />Sair</button>
      </div>

      @if (store.form(); as f) { <tx-form [draft]="f.draft" (close)="closeForm($event)" /> }
      @if (store.recovery()) {
        <div class="scrim"></div>
        <form class="drawer" (ngSubmit)="setNewPassword()" role="dialog" aria-modal="true" aria-label="Nova senha">
          <header><h2>Criar nova senha</h2></header>
          <div class="body">
            <p class="muted" style="margin:0">Você entrou pelo link de redefinição. Escolha a nova senha.</p>
            <label>Nova senha <input name="np" type="password" [(ngModel)]="newPass" required minlength="8" autocomplete="new-password" /></label>
            <label>Repita a senha <input name="np2" type="password" [(ngModel)]="newPass2" required autocomplete="new-password" /></label>
          </div>
          <footer><span></span><button class="btn primary" [disabled]="busy"><g-icon name="check" [size]="18" />Salvar senha</button></footer>
        </form>
      }
    }
    @if (toast(); as t) {
      <div class="toast" [class.error]="t.tone === 'error'" role="status">
        <g-icon [name]="t.tone === 'error' ? 'error' : 'check_circle'" [fill]="true" />
        <span>{{ t.text }}</span>
        @if (t.action; as a) { <button (click)="a.run(); toast.set(null)"><g-icon name="undo" [size]="16" /> {{ a.label }}</button> }
      </div>
    }
  `,
})
export class App {
  store = inject(Store);
  router = inject(Router);
  nav = NAV;
  toast = toast;
  hidden = hidden;
  theme = theme;
  setTheme = setTheme;
  themes: { v: Theme; label: string; icon: string }[] = [
    { v: '', label: 'Sistema', icon: 'brightness_auto' }, { v: 'light', label: 'Claro', icon: 'light_mode' }, { v: 'dark', label: 'Escuro', icon: 'dark_mode' },
  ];
  themeLabel = () => this.themes.find((t) => t.v === theme())!.label;
  cycleTheme() {
    const order: Theme[] = ['', 'light', 'dark'];
    setTheme(order[(order.indexOf(theme()) + 1) % 3]);
  }
  toggleHidden = toggleHidden;
  email = '';
  pass = '';
  showPass = false;
  signup = false;
  name = '';
  busy = false;
  newPass = '';
  newPass2 = '';

  google() {
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  }
  async passwordLogin() {
    this.busy = true;
    const { error } = await sb.auth.signInWithPassword({ email: this.email.trim(), password: this.pass });
    this.busy = false;
    if (error) notify(authError(error.message), { tone: 'error' });
  }
  async createAccount() {
    if (this.pass.length < 8) return notify('Use pelo menos 8 caracteres na senha.', { tone: 'error' });
    this.busy = true;
    const { data, error } = await sb.auth.signUp({ email: this.email.trim(), password: this.pass, options: { data: { full_name: this.name.trim() } } });
    this.busy = false;
    if (error) return notify(authError(error.message), { tone: 'error' });
    // com confirmação de e-mail desligada a sessão já vem; senão, avisa para confirmar
    if (!data.session) notify('Conta criada. Confirme pelo link enviado ao seu e-mail.');
    else notify(`Bem-vindo, ${this.name.trim().split(' ')[0] || 'à grana'}!`);
  }
  async forgot() {
    if (!this.email.includes('@')) return notify('Digite seu e-mail primeiro.', { tone: 'error' });
    const { error } = await sb.auth.resetPasswordForEmail(this.email.trim(), { redirectTo: location.origin });
    // mesma resposta exista ou não a conta (não revela quem está cadastrado)
    if (error && /rate limit/i.test(error.message)) return notify(authError(error.message), { tone: 'error' });
    notify('Se o e-mail estiver cadastrado, enviamos um link para criar nova senha.');
  }
  async setNewPassword() {
    if (this.newPass.length < 8) return notify('Use pelo menos 8 caracteres.', { tone: 'error' });
    if (this.newPass !== this.newPass2) return notify('As senhas não conferem.', { tone: 'error' });
    this.busy = true;
    const { error } = await sb.auth.updateUser({ password: this.newPass });
    this.busy = false;
    if (error) return notify(authError(error.message), { tone: 'error' });
    this.store.recovery.set(false);
    this.newPass = this.newPass2 = '';
    notify('Senha atualizada');
  }
  logout() {
    sb.auth.signOut();
  }
  hide(id: string) {
    document.getElementById(id)?.hidePopover();
  }
  closeForm(id: string | null) {
    const f = this.store.form();
    this.store.form.set(null);
    f?.done?.(id);
  }

  private synced = false;
  /** splash do index.html continua até a sessão carregar, depois sai com fade */
  splash = signal(true);
  constructor() {
    effect(() => { if (this.store.ready()) setTimeout(() => this.splash.set(false), 500); });
    effect(async () => {
      if (!this.store.session() || this.synced) return;
      this.synced = true;
      const { data } = await sb.from('pluggy_items').select('last_sync_at');
      const stale = (data ?? []).some((i) => !i.last_sync_at || Date.now() - Date.parse(i.last_sync_at) > 12 * 3600e3);
      if (stale && (await pluggySync())) await this.store.load();
    });
  }

  /** Atalhos: D despesa, R receita, T transferência, H ocultar valores, / buscar. */
  @HostListener('document:keydown', ['$event'])
  keys(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || !this.store.session()) return;
    if (e.key === 'Escape' && this.store.form()) return this.closeForm(null);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || this.store.form()) return;
    const k = e.key.toLowerCase();
    const kind = ({ d: 'expense', r: 'income', t: 'transfer' } as const)[k as 'd' | 'r' | 't'];
    if (kind) { e.preventDefault(); this.store.open({ kind }); }
    else if (k === 'h') toggleHidden();
    else if (k === '/') {
      e.preventDefault();
      const focus = () => (document.getElementById('search') ?? (document.querySelector('button[aria-label^="Buscar"]') as HTMLElement | null)?.click(), setTimeout(() => document.getElementById('search')?.focus(), 30));
      if (location.pathname.startsWith('/lancamentos')) focus();
      else this.router.navigateByUrl('/lancamentos').then(() => setTimeout(focus, 50));
    }
  }
}
