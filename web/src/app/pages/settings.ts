import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, must, sb, toCents } from '../core';

// Pacotes Android dos bancos (observados no celular + catálogo do Organizze)
const PACKAGES = [
  ['com.nu.production', 'Nubank'], ['com.bradesco', 'Bradesco'], ['br.com.bradesco.cartoes', 'Bradesco Cartões'],
  ['br.com.sicoobnet', 'Sicoob'], ['tivit.com.cabal.sicoob.cp', 'Sicoob Cartões'], ['br.com.gabba.Caixa', 'Caixa'],
  ['com.itau', 'Itaú'], ['br.com.intermedium', 'Inter'], ['com.c6bank.app', 'C6'], ['com.picpay', 'PicPay'],
  ['com.mercadopago.wallet', 'Mercado Pago'], ['br.com.bb.android', 'Banco do Brasil'], ['br.com.santander.way', 'Santander'],
];

type Kind = 'accounts' | 'cards' | 'categories';
type Row = Record<string, any>;

@Component({
  imports: [FormsModule],
  template: `
    <datalist id="pk">@for (p of packages; track p[0]) { <option [value]="p[0]">{{ p[1] }}</option> }</datalist>

    <section class="box">
      <div class="row between"><h3>Contas</h3><button (click)="edit.set({ kind: 'accounts', row: { kind: 'checking', initial_balance: 0 } })">+ Conta</button></div>
      @for (a of rows().accounts; track a['id']) {
        <div class="item click" (click)="open('accounts', a)"><span class="dot" [style.background]="a['color'] || '#1fa463'"></span>
          <span class="grow">{{ a['name'] }} @if (a['archived']) { <small class="muted">arquivada</small> }<br /><small class="muted">{{ a['notify_package'] || 'sem app de notificação' }}</small></span></div>
      }
    </section>

    <section class="box">
      <div class="row between"><h3>Cartões</h3><button (click)="edit.set({ kind: 'cards', row: { closing_day: 1, due_day: 10, limit_cents: 0 } })">+ Cartão</button></div>
      @for (c of rows().cards; track c['id']) {
        <div class="item click" (click)="open('cards', c)"><span class="grow">{{ c['name'] }} @if (c['last4']) { <small class="muted">final {{ c['last4'] }}</small> }
          @if (c['archived']) { <small class="muted">arquivado</small> }<br /><small class="muted">fecha {{ c['closing_day'] }} · vence {{ c['due_day'] }} · {{ c['notify_package'] || 'sem app de notificação' }}</small></span></div>
      }
    </section>

    <section class="box">
      <div class="row between"><h3>Categorias</h3><button (click)="edit.set({ kind: 'categories', row: { kind: 'expense', color: '#1fa463' } })">+ Categoria</button></div>
      <div class="cols">
        @for (k of ['expense', 'income']; track k) {
          <div><small class="muted">{{ k === 'expense' ? 'Despesas' : 'Receitas' }}</small>
            @for (c of catsOf(k); track c['id']) {
              <div class="item click" (click)="open('categories', c)"><span class="dot" [style.background]="c['color']"></span>
                <span class="grow">{{ c['parent_id'] ? '↳ ' : '' }}{{ c['name'] }}</span></div>
            }
          </div>
        }
      </div>
    </section>

    @if (edit(); as e) {
      <div class="overlay" (click)="edit.set(null)">
        <form class="box dialog" (click)="$event.stopPropagation()" (ngSubmit)="save(e.kind, e.row)">
          <h3>{{ e.row['id'] ? 'Editar' : 'Novo(a)' }} {{ e.kind === 'accounts' ? 'conta' : e.kind === 'cards' ? 'cartão' : 'categoria' }}</h3>
          <label>Nome <input name="n" [(ngModel)]="e.row['name']" required /></label>
          @switch (e.kind) {
            @case ('accounts') {
              <div class="row">
                <label>Tipo <select name="k" [(ngModel)]="e.row['kind']">
                  <option value="checking">Corrente</option><option value="savings">Poupança</option><option value="investment">Investimento</option>
                  <option value="wallet">Carteira</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$) <input name="b" type="number" step="0.01" [(ngModel)]="e.row['_initial']" /></label>
              </div>
              <label>App que notifica (Pix/débito) <input name="p" list="pk" [(ngModel)]="e.row['notify_package']" /></label>
            }
            @case ('cards') {
              <div class="row">
                <label>Limite (R$) <input name="l" type="number" step="0.01" [(ngModel)]="e.row['_limit']" /></label>
                <label>Final <input name="f" maxlength="4" [(ngModel)]="e.row['last4']" placeholder="1234" /></label>
              </div>
              <div class="row">
                <label>Dia de fechamento <input name="c" type="number" min="1" max="31" [(ngModel)]="e.row['closing_day']" required /></label>
                <label>Dia de vencimento <input name="v" type="number" min="1" max="31" [(ngModel)]="e.row['due_day']" required /></label>
              </div>
              <label>App que notifica as compras <input name="p" list="pk" [(ngModel)]="e.row['notify_package']" /></label>
              <label>Conta de pagamento <select name="pa" [(ngModel)]="e.row['payment_account_id']">
                <option [ngValue]="null">—</option>
                @for (a of rows().accounts; track a['id']) { <option [ngValue]="a['id']">{{ a['name'] }}</option> }
              </select></label>
            }
            @case ('categories') {
              <div class="row">
                <label>Tipo <select name="k" [(ngModel)]="e.row['kind']"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                <label>Cor <input name="cor" type="color" [(ngModel)]="e.row['color']" /></label>
              </div>
              <label>Subcategoria de <select name="pa" [(ngModel)]="e.row['parent_id']">
                <option [ngValue]="null">—</option>
                @for (c of catsOf(e.row['kind']); track c['id']) { @if (!c['parent_id'] && c['id'] !== e.row['id']) { <option [ngValue]="c['id']">{{ c['name'] }}</option> } }
              </select></label>
            }
          }
          @if (e.kind !== 'categories') { <label>Cor <input name="cor" type="color" [(ngModel)]="e.row['color']" /></label> }
          <label class="check"><input name="ar" type="checkbox" [(ngModel)]="e.row['archived']" /> Arquivado</label>
          <div class="row between">
            @if (e.row['id']) { <button type="button" class="danger" (click)="remove(e.kind, e.row['id'])">Excluir</button> } @else { <span></span> }
            <div class="row"><button type="button" (click)="edit.set(null)">Cancelar</button><button class="primary">Salvar</button></div>
          </div>
          @if (e.row['id']) { <small class="muted">Excluir conta/cartão apaga os lançamentos dele. Prefira arquivar.</small> }
        </form>
      </div>
    }
  `,
})
export class Settings {
  store = inject(Store);
  packages = PACKAGES;
  rows = signal<Record<Kind, Row[]>>({ accounts: [], cards: [], categories: [] });
  edit = signal<{ kind: Kind; row: Row } | null>(null);

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
    this.edit.set({ kind, row: { ...r, _initial: (r['initial_balance'] ?? 0) / 100, _limit: (r['limit_cents'] ?? 0) / 100 } });
  }

  async save(kind: Kind, r: Row) {
    const { _initial, _limit, created_at, user_id, ...row } = r;
    if (kind === 'accounts') row['initial_balance'] = toCents(_initial ?? 0);
    if (kind === 'cards') row['limit_cents'] = toCents(_limit ?? 0);
    for (const k of ['notify_package', 'last4']) if (row[k] === '') row[k] = null;
    await must(row['id'] ? sb.from(kind).update(row).eq('id', row['id']) : sb.from(kind).insert(row));
    this.edit.set(null);
    await this.store.load();
  }

  async remove(kind: Kind, id: string) {
    await must(sb.from(kind).delete().eq('id', id));
    this.edit.set(null);
    await this.store.load();
  }
}
