import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, bankColor, catIcon, must, notify, sb, toCents } from '../core';
import { CATEGORY_ICONS, Icon } from '../icon';

// Pacotes Android dos bancos (observados no celular + catálogo do Organizze)
export const PACKAGES: [string, string][] = [
  ['com.nu.production', 'Nubank'], ['com.bradesco', 'Bradesco'], ['br.com.bradesco.cartoes', 'Bradesco Cartões'],
  ['br.com.sicoobnet', 'Sicoob'], ['tivit.com.cabal.sicoob.cp', 'Sicoob Cartões'], ['br.com.gabba.Caixa', 'Caixa'],
  ['com.itau', 'Itaú'], ['br.com.intermedium', 'Inter'], ['com.c6bank.app', 'C6'], ['com.picpay', 'PicPay'],
  ['com.mercadopago.wallet', 'Mercado Pago'], ['br.com.bb.android', 'Banco do Brasil'], ['br.com.santander.way', 'Santander'],
];

type Kind = 'accounts' | 'cards' | 'categories';
type Row = Record<string, any>;

@Component({
  imports: [FormsModule, Icon],
  template: `
    <div class="page-title reveal"><h1>Ajustes</h1></div>
    <datalist id="pk">@for (p of packages; track p[0]) { <option [value]="p[0]">{{ p[1] }}</option> }</datalist>

    <div class="grid-2 reveal">
      <section class="panel">
        <div class="panel-head"><h2>Contas</h2><button class="btn" (click)="edit.set({ kind: 'accounts', row: { kind: 'checking', _initial: 0, color: '#1f6f4a' } })"><g-icon name="add" [size]="18" />Conta</button></div>
        <div class="list">
          @for (a of rows().accounts; track a['id']) {
            <div class="item click" (click)="open('accounts', a)">
              <span class="cat-ico" [style.--cc]="bankColor(a['name'], a['color']) ?? 'var(--brand)'"><span class="ms">account_balance</span></span>
              <div class="grow"><div class="title">{{ a['name'] }} @if (a['archived']) { <span class="tag">arquivada</span> }</div>
                <div class="sub">@if (a['notify_package']) {<g-icon name="notifications" [size]="14" />{{ bank(a['notify_package']) }}} @else { sem notificação ligada }</div></div>
              <g-icon name="chevron_right" class="muted" />
            </div>
          }
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Cartões</h2><button class="btn" (click)="edit.set({ kind: 'cards', row: { closing_day: 1, due_day: 10, _limit: 0, color: '#1f6f4a' } })"><g-icon name="add" [size]="18" />Cartão</button></div>
        <div class="list">
          @for (c of rows().cards; track c['id']) {
            <div class="item click" (click)="open('cards', c)">
              <span class="cat-ico" [style.--cc]="bankColor(c['name'], c['color']) ?? 'var(--brand)'"><span class="ms">credit_card</span></span>
              <div class="grow"><div class="title">{{ c['name'] }} @if (c['last4']) { <span class="tag">final {{ c['last4'] }}</span> } @if (c['archived']) { <span class="tag">arquivado</span> }</div>
                <div class="sub">fecha {{ c['closing_day'] }} · vence {{ c['due_day'] }} · {{ c['notify_package'] ? bank(c['notify_package']) : 'sem notificação' }}</div></div>
              <g-icon name="chevron_right" class="muted" />
            </div>
          }
        </div>
      </section>
    </div>

    <section class="panel reveal">
      <div class="panel-head"><h2>Categorias</h2><button class="btn" (click)="edit.set({ kind: 'categories', row: { kind: 'expense', color: '#1f6f4a', icon: null } })"><g-icon name="add" [size]="18" />Categoria</button></div>
      <div class="grid-2">
        @for (k of ['expense', 'income']; track k) {
          <div><p class="muted small" style="margin:0 0 .3rem">{{ k === 'expense' ? 'Saídas' : 'Entradas' }}</p>
            <div class="list">
              @for (c of catsOf(k); track c['id']) {
                <div class="item click" (click)="open('categories', c)" [style.padding-left]="c['parent_id'] ? '1.8rem' : null">
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

    @if (edit(); as e) {
      <div class="scrim" (click)="edit.set(null)"></div>
      <form class="drawer" (ngSubmit)="save(e.kind, e.row)" role="dialog" aria-modal="true">
        <header>
          <h2>{{ e.row['id'] ? 'Editar' : 'Nova' }} {{ e.kind === 'accounts' ? 'conta' : e.kind === 'cards' ? 'cartão' : 'categoria' }}</h2>
          <button type="button" class="btn ghost icon" (click)="edit.set(null)" aria-label="Fechar"><g-icon name="close" /></button>
        </header>
        <div class="body">
          <label>Nome <input name="n" [(ngModel)]="e.row['name']" required /></label>
          @switch (e.kind) {
            @case ('accounts') {
              <div class="row">
                <label>Tipo <select name="k" [(ngModel)]="e.row['kind']">
                  <option value="checking">Corrente</option><option value="savings">Poupança</option><option value="investment">Investimento</option>
                  <option value="wallet">Carteira</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$) <input name="b" type="number" step="0.01" [(ngModel)]="e.row['_initial']" /></label>
              </div>
              <label>App que notifica Pix/débito <input name="p" list="pk" [(ngModel)]="e.row['notify_package']" placeholder="ex.: com.nu.production" /></label>
            }
            @case ('cards') {
              <div class="row">
                <label>Limite (R$) <input name="l" type="number" step="0.01" [(ngModel)]="e.row['_limit']" /></label>
                <label>Final <input name="f" maxlength="4" inputmode="numeric" [(ngModel)]="e.row['last4']" placeholder="1234" /></label>
              </div>
              <div class="row">
                <label>Fecha dia <input name="c" type="number" min="1" max="31" [(ngModel)]="e.row['closing_day']" required /></label>
                <label>Vence dia <input name="v" type="number" min="1" max="31" [(ngModel)]="e.row['due_day']" required /></label>
              </div>
              <label>App que notifica as compras <input name="p" list="pk" [(ngModel)]="e.row['notify_package']" /></label>
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
          <div class="row">
            <label>Cor <input name="cor" type="color" [(ngModel)]="e.row['color']" /></label>
            <label class="check" style="align-self:flex-end"><input name="ar" type="checkbox" [(ngModel)]="e.row['archived']" /> Arquivado</label>
          </div>
          @if (e.row['id'] && e.kind !== 'categories') { <p class="muted small">Excluir apaga também os lançamentos. Prefira arquivar.</p> }
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
  packages = PACKAGES;
  icons = CATEGORY_ICONS;
  rows = signal<Record<Kind, Row[]>>({ accounts: [], cards: [], categories: [] });
  edit = signal<{ kind: Kind; row: Row } | null>(null);
  bank = (pkg: string) => PACKAGES.find(([p]) => p === pkg)?.[1] ?? pkg;
  icon = (c: Row) => catIcon(c as never);
  bankColor = bankColor;

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

  open(kind: Kind, r: Row) {
    const color = kind === 'categories' ? r['color'] : bankColor(r['name'], r['color']) ?? '#1f6f4a';
    this.edit.set({ kind, row: { ...r, color, _initial: (r['initial_balance'] ?? 0) / 100, _limit: (r['limit_cents'] ?? 0) / 100 } });
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
}
