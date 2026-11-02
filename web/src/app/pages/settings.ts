import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BANKS, Bank, BankLogo, NETWORKS, bankByPackage, bankOf, bankPackage, networkLogo } from '../banks';
import { Store, authError, bankColor, catIcon, must, notify, sb, toCents } from '../core';
import { CATEGORY_ICONS, Icon } from '../icon';

/** Nome do banco por pacote Android (usado na tela de notificações). */
export const bankName = (pkg: string) => bankByPackage(pkg)?.name ?? pkg;

type Kind = 'accounts' | 'cards' | 'categories';
type Row = Record<string, any>;

@Component({
  imports: [FormsModule, Icon, BankLogo],
  template: `
    <div class="page-title reveal"><h1>Ajustes</h1></div>

    <div class="grid-2 reveal">
      <section class="panel">
        <div class="panel-head"><h2>Contas</h2><button class="btn" (click)="create('accounts')"><g-icon name="add" [size]="18" />Conta</button></div>
        <div class="list">
          @for (a of rows().accounts; track a['id']) {
            <div class="item click" (click)="open('accounts', a)" tabindex="0" (keydown.enter)="open('accounts', a)">
              <g-bank [name]="a['name']" [institution]="a['institution']" />
              <div class="grow"><div class="title">{{ a['name'] }} @if (a['archived']) { <span class="tag">arquivada</span> }</div>
                <div class="sub">@if (a['notify_package']) {<g-icon name="notifications" [size]="14" />{{ bankName(a['notify_package']) }}} @else { sem notificação ligada }</div></div>
              <g-icon name="chevron_right" class="muted" />
            </div>
          }
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Cartões de crédito</h2><button class="btn" (click)="create('cards')"><g-icon name="add" [size]="18" />Cartão</button></div>
        <div class="list">
          @for (c of rows().cards; track c['id']) {
            <div class="item click" (click)="open('cards', c)" tabindex="0" (keydown.enter)="open('cards', c)">
              <g-bank [name]="c['name']" [institution]="c['institution']" fallback="credit_card" />
              <div class="grow"><div class="title">{{ c['name'] }} @if (c['last4']) { <span class="tag">final {{ c['last4'] }}</span> } @if (c['archived']) { <span class="tag">arquivado</span> }</div>
                <div class="sub">fecha {{ c['closing_day'] }} · vence {{ c['due_day'] }} · {{ c['notify_package'] ? bankName(c['notify_package']) : 'sem notificação' }}</div></div>
              @if (networkLogo(c['network']); as n) { <img class="net-logo" [src]="n" alt="" referrerpolicy="no-referrer" /> }
              <g-icon name="chevron_right" class="muted" />
            </div>
          }
        </div>
      </section>
    </div>

    <section class="panel reveal">
      <div class="panel-head"><h2>Categorias</h2><button class="btn" (click)="create('categories')"><g-icon name="add" [size]="18" />Categoria</button></div>
      <div class="grid-2">
        @for (k of ['expense', 'income']; track k) {
          <div><p class="muted small" style="margin:0 0 .4rem">{{ k === 'expense' ? 'Saídas' : 'Entradas' }}</p>
            <div class="list">
              @for (c of catsOf(k); track c['id']) {
                <div class="item click" (click)="open('categories', c)" [style.padding-left]="c['parent_id'] ? '2rem' : null" tabindex="0" (keydown.enter)="open('categories', c)">
                  <span class="cat-ico" [style.--cc]="c['color']"><span class="ms">{{ icon(c) }}</span></span>
                  <div class="grow"><div class="title">{{ c['name'] }}</div></div>
                  <g-icon name="chevron_right" class="muted" />
                </div>
              }
            </div>
          </div>
        }
      </div>
    </section>

    <section class="panel reveal">
      <div class="panel-head"><h2>Segurança</h2><g-icon name="lock" class="muted" /></div>
      <p class="muted" style="margin:0 0 1rem">Entre também com <b>{{ store.session()?.user?.email }}</b> e uma senha, além do Google.</p>
      <form class="row wrap end" (ngSubmit)="setPassword()">
        <label style="min-width:200px">Nova senha <input name="p1" type="password" [(ngModel)]="pass1" minlength="8" required autocomplete="new-password" /></label>
        <label style="min-width:200px">Repita <input name="p2" type="password" [(ngModel)]="pass2" required autocomplete="new-password" /></label>
        <button class="btn primary"><g-icon name="lock" [size]="18" />Definir senha</button>
      </form>
      <p class="muted small" style="margin:.8rem 0 0">Mínimo de 8 caracteres. Novos cadastros estão fechados: só você entra.</p>
    </section>

    @if (edit(); as e) {
      <div class="scrim" (click)="edit.set(null)"></div>
      <form class="drawer" (ngSubmit)="save(e.kind, e.row)" role="dialog" aria-modal="true">
        <header>
          <h2>{{ e.row['id'] ? 'Editar' : 'Nova' }} {{ e.kind === 'accounts' ? 'conta' : e.kind === 'cards' ? 'cartão' : 'categoria' }}</h2>
          <button type="button" class="btn ghost icon" (click)="edit.set(null)" aria-label="Fechar"><g-icon name="close" /></button>
        </header>
        <div class="body">
          @if (e.kind !== 'categories') {
            <label>Banco</label>
            <div class="search"><g-icon name="search" /><input name="bq" placeholder="Buscar banco" [ngModel]="bankQuery()" (ngModelChange)="bankQuery.set($event)" autocomplete="off" /></div>
            <div class="bank-grid" role="radiogroup" aria-label="Banco">
              @for (b of banks(); track b.id) {
                <button type="button" role="radio" [attr.aria-checked]="isBank(e.row, b)" [class.on]="isBank(e.row, b)" (click)="pickBank(e, b)">
                  <g-bank [institution]="b.id" [size]="34" /><span>{{ b.name }}</span>
                </button>
              }
            </div>
          }
          <label>Nome <input name="n" [(ngModel)]="e.row['name']" required /></label>
          @switch (e.kind) {
            @case ('accounts') {
              <div class="row">
                <label>Tipo <select name="k" [(ngModel)]="e.row['kind']">
                  <option value="checking">Corrente</option><option value="savings">Poupança</option><option value="investment">Investimento</option>
                  <option value="wallet">Carteira</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$) <input name="b" type="number" step="0.01" [(ngModel)]="e.row['_initial']" /></label>
              </div>
            }
            @case ('cards') {
              <label>Bandeira</label>
              <div class="row wrap" role="radiogroup" aria-label="Bandeira">
                @for (n of networks; track n.id) {
                  <button type="button" class="chip net" role="radio" [attr.aria-checked]="e.row['network'] === n.id" [class.on]="e.row['network'] === n.id"
                          (click)="e.row['network'] = e.row['network'] === n.id ? null : n.id">
                    <img [src]="networkLogo(n.id)" alt="" referrerpolicy="no-referrer" />{{ n.name }}
                  </button>
                }
              </div>
              <div class="row">
                <label>Limite (R$) <input name="l" type="number" step="0.01" [(ngModel)]="e.row['_limit']" /></label>
                <label>Final <input name="f" maxlength="4" inputmode="numeric" [(ngModel)]="e.row['last4']" placeholder="1234" /></label>
              </div>
              <div class="row">
                <label>Fecha dia <input name="c" type="number" min="1" max="31" [(ngModel)]="e.row['closing_day']" required /></label>
                <label>Vence dia <input name="v" type="number" min="1" max="31" [(ngModel)]="e.row['due_day']" required /></label>
              </div>
              <label>Pago com a conta <select name="pa" [(ngModel)]="e.row['payment_account_id']">
                <option [ngValue]="null">—</option>
                @for (a of rows().accounts; track a['id']) { <option [ngValue]="a['id']">{{ a['name'] }}</option> }
              </select></label>
            }
            @case ('categories') {
              <div class="row">
                <label>Tipo <select name="k" [(ngModel)]="e.row['kind']"><option value="expense">Saída</option><option value="income">Entrada</option></select></label>
                <label>Subcategoria de <select name="pa" [(ngModel)]="e.row['parent_id']">
                  <option [ngValue]="null">—</option>
                  @for (c of catsOf(e.row['kind']); track c['id']) { @if (!c['parent_id'] && c['id'] !== e.row['id']) { <option [ngValue]="c['id']">{{ c['name'] }}</option> } }
                </select></label>
              </div>
              <label>Ícone</label>
              <div class="icon-grid" role="radiogroup" aria-label="Ícone">
                @for (i of icons; track i) {
                  <button type="button" role="radio" [attr.aria-checked]="icon(e.row) === i" [class.on]="icon(e.row) === i" (click)="e.row['icon'] = i" [title]="i"><span class="ms">{{ i }}</span></button>
                }
              </div>
            }
          }
          @if (e.kind !== 'categories') {
            <label>App que notifica (lançamento automático)
              <select name="p" [(ngModel)]="e.row['notify_package']">
                <option [ngValue]="null">Nenhum</option>
                @for (b of allBanks; track b.id) { @for (p of b.packages; track p) { <option [ngValue]="p">{{ b.name }} · {{ p }}</option> } }
              </select>
            </label>
          }
          <div class="row end">
            <label>Cor <input name="cor" type="color" [(ngModel)]="e.row['color']" /></label>
            <label class="check"><input name="ar" type="checkbox" [(ngModel)]="e.row['archived']" /> Arquivado</label>
          </div>
          @if (e.row['id'] && e.kind !== 'categories') { <p class="muted small" style="margin:0">Excluir apaga também os lançamentos. Prefira arquivar.</p> }
        </div>
        <footer>
          @if (e.row['id']) { <button type="button" class="btn ghost danger" (click)="remove(e.kind, e.row['id'])"><g-icon name="delete" [size]="18" />Excluir</button> } @else { <span></span> }
          <button class="btn primary"><g-icon name="check" [size]="18" />Salvar</button>
        </footer>
      </form>
    }
  `,
})
export class Settings {
  store = inject(Store);
  icons = CATEGORY_ICONS;
  networks = NETWORKS;
  allBanks = BANKS;
  networkLogo = networkLogo;
  bankName = bankName;
  rows = signal<Record<Kind, Row[]>>({ accounts: [], cards: [], categories: [] });
  edit = signal<{ kind: Kind; row: Row } | null>(null);
  bankQuery = signal('');
  banks = computed(() => {
    const q = this.bankQuery().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return BANKS.filter((b) => !q || b.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  });
  pass1 = '';
  pass2 = '';
  icon = (c: Row) => catIcon(c as never);

  constructor() {
    effect(() => { this.store.version(); untracked(() => this.fetch()); });
  }

  catsOf(kind: string) {
    const all = this.rows().categories.filter((c) => c['kind'] === kind);
    return all.filter((c) => !c['parent_id']).flatMap((p) => [p, ...all.filter((c) => c['parent_id'] === p['id'])]);
  }

  async fetch() {
    const [a, c, k] = await Promise.all([
      must(sb.from('accounts').select('*').order('name')),
      must(sb.from('cards').select('*').order('name')),
      must(sb.from('categories').select('*').order('name')),
    ]);
    this.rows.set({ accounts: a, cards: c, categories: k });
  }

  create(kind: Kind) {
    this.bankQuery.set('');
    const row: Row = kind === 'accounts' ? { kind: 'checking', _initial: 0, color: '#1f6f4a', notify_package: null }
      : kind === 'cards' ? { closing_day: 1, due_day: 10, _limit: 0, color: '#1f6f4a', notify_package: null, network: null }
      : { kind: 'expense', color: '#1f6f4a', icon: null };
    this.edit.set({ kind, row });
  }

  open(kind: Kind, r: Row) {
    this.bankQuery.set('');
    const color = kind === 'categories' ? r['color'] : bankColor(r['name'], r['color'], r['institution']) ?? '#1f6f4a';
    this.edit.set({ kind, row: { ...r, color, _initial: (r['initial_balance'] ?? 0) / 100, _limit: (r['limit_cents'] ?? 0) / 100 } });
  }

  isBank(row: Row, b: Bank) {
    return bankOf(row['name'], row['institution'])?.id === b.id;
  }

  /** Escolher o banco preenche nome, cor e app que notifica (dá pra ajustar depois). */
  pickBank(e: { kind: Kind; row: Row }, b: Bank) {
    const r = e.row;
    const prev = bankOf(r['name'], r['institution']);
    r['institution'] = b.id;
    if (!r['name'] || (prev && r['name'] === prev.name)) r['name'] = b.name;
    r['color'] = b.color;
    r['notify_package'] = bankPackage(b, e.kind === 'cards');
  }

  async save(kind: Kind, r: Row) {
    const { _initial, _limit, created_at, user_id, ...row } = r;
    if (kind === 'accounts') row['initial_balance'] = toCents(_initial ?? 0);
    if (kind === 'cards') row['limit_cents'] = toCents(_limit ?? 0);
    for (const k of ['notify_package', 'last4']) if (row[k] === '') row[k] = null;
    await must(row['id'] ? sb.from(kind).update(row).eq('id', row['id']) : sb.from(kind).insert(row));
    this.edit.set(null);
    await this.store.load();
    notify('Salvo');
  }

  async remove(kind: Kind, id: string) {
    await must(sb.from(kind).delete().eq('id', id));
    this.edit.set(null);
    await this.store.load();
    notify('Excluído');
  }

  async setPassword() {
    if (this.pass1.length < 8) return notify('Use pelo menos 8 caracteres.', { tone: 'error' });
    if (this.pass1 !== this.pass2) return notify('As senhas não conferem.', { tone: 'error' });
    const { error } = await sb.auth.updateUser({ password: this.pass1 });
    if (error) return notify(authError(error.message), { tone: 'error' });
    this.pass1 = this.pass2 = '';
    notify('Senha definida. Agora você também entra com e-mail e senha.');
  }
}
