import { Component, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, Tx, addMonths, brl, catIcon, must, notify, sb, today } from './core';
import { ChipOption, ChipSelect, DatePick, Keypad, Money } from './fields';
import { Icon } from './icon';

export type TxKind = 'expense' | 'income' | 'transfer';
/** Pré-preenchimento: lançamento existente (edição) ou parcial (novo / vindo de notificação). */
export type TxDraft = Partial<Tx> & { kind?: TxKind };

@Component({
  selector: 'tx-form',
  imports: [FormsModule, Icon, Money, DatePick, Keypad, ChipSelect],
  template: `
    <div class="scrim" (click)="close.emit(null)"></div>
    <form class="drawer tx" [attr.data-kind]="kind()" (ngSubmit)="save()" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      <div class="tx-head">
        <div class="row between">
          @if (!draft().id) {
            <div class="tx-tabs" role="tablist" aria-label="Tipo">
              <button type="button" role="tab" [attr.aria-selected]="kind() === 'expense'" [class.on]="kind() === 'expense'" (click)="setKind('expense')">Despesa</button>
              <button type="button" role="tab" [attr.aria-selected]="kind() === 'income'" [class.on]="kind() === 'income'" (click)="setKind('income')">Receita</button>
              <button type="button" role="tab" [attr.aria-selected]="kind() === 'transfer'" [class.on]="kind() === 'transfer'" (click)="setKind('transfer')">Transferência</button>
            </div>
          } @else { <b class="tx-title">{{ title() }}</b> }
          <button type="button" class="btn ghost icon on-k" (click)="close.emit(null)" aria-label="Fechar"><g-icon name="close" /></button>
        </div>
        <div class="tx-amount" (click)="mobile && openKeypad()">
          <g-money [(cents)]="f.cents" inputId="valor" [keypad]="keypad()" />
          @if (kind() !== 'transfer' && f.origin.startsWith('a:')) {
            <button type="button" class="thumb" [class.on]="f.paid" (click)="$event.stopPropagation(); f.paid = !f.paid" [attr.aria-pressed]="f.paid"
                    [title]="f.paid ? (kind() === 'income' ? 'Recebido' : 'Pago') : (kind() === 'income' ? 'A receber' : 'A pagar')">
              <g-icon name="thumb_up" [size]="30" [fill]="f.paid" />
            </button>
          }
        </div>
        @if (kind() !== 'transfer' && f.origin.startsWith('a:')) {
          <small class="tx-paid">{{ f.paid ? (kind() === 'income' ? 'Recebido' : 'Pago') : (kind() === 'income' ? 'A receber' : 'A pagar') }}</small>
        }
        @if (f.repeat === 'parcelado' && f.cents) { <small class="tx-paid">{{ f.times }}× de {{ fmt(f.cents / f.times) }}</small> }
      </div>

      <div class="body tx-body" (pointerdown)="keypad.set(false)">
        @if (kind() !== 'transfer') {
          <label class="tx-row"><span class="lbl">Descrição</span>
            <span class="tx-val"><g-icon name="edit" class="muted" /><input class="bare" name="d" [(ngModel)]="f.description" (ngModelChange)="suggestSoon()" required placeholder="Adicione a descrição" autocomplete="off" /></span>
          </label>
          @if (hint(); as h) {
            <button type="button" class="suggest" (click)="f.category_id = h.id; hint.set(null)"><g-icon name="auto_awesome" />Usar categoria {{ h.name }}</button>
          }
          <div class="tx-row"><span class="lbl">Categoria</span>
            <g-chip-select variant="row" label="Categoria" placeholder="Sem categoria" [options]="catOptions()" [(value)]="f.category_id" />
          </div>
          <div class="tx-row"><span class="lbl">{{ kind() === 'income' ? 'Recebido em' : 'Pago com' }}</span>
            <g-chip-select variant="row" [label]="kind() === 'income' ? 'Recebido em' : 'Pago com'" [options]="originOptions()" [(value)]="f.origin" [clearable]="false" fallbackIcon="account_balance" />
          </div>
        } @else {
          <div class="tx-row"><span class="lbl">Saiu de</span>
            <g-chip-select variant="row" label="Saiu de" [options]="accountOptions('a:')" [(value)]="f.origin" [clearable]="false" fallbackIcon="account_balance" />
          </div>
          <div class="tx-row"><span class="lbl">Entrou em</span>
            <g-chip-select variant="row" label="Entrou em" placeholder="Escolha a conta" [options]="accountOptions('')" [(value)]="f.to" [clearable]="false" fallbackIcon="account_balance" />
          </div>
        }

        <div class="tx-row"><span class="lbl">Data</span><g-date [(value)]="f.date" /></div>

        @if (kind() !== 'transfer') {
          @if (!draft().id) {
            <div class="tx-row"><span class="lbl">Repetir lançamento</span>
              <div class="row wrap">
                <button type="button" class="pill" [class.on]="f.repeat === 'fixo'" (click)="f.repeat = f.repeat === 'fixo' ? 'none' : 'fixo'"><g-icon name="repeat" [size]="18" />Fixo</button>
                <button type="button" class="pill" [class.on]="f.repeat === 'parcelado'" (click)="f.repeat = f.repeat === 'parcelado' ? 'none' : 'parcelado'"><g-icon name="credit_card" [size]="18" />Parcelado</button>
                @if (f.repeat === 'parcelado') {
                  <span class="stepper">
                    <button type="button" (click)="f.times = Math.max(2, f.times - 1)" aria-label="Menos parcelas">−</button>
                    <b>{{ f.times }}×</b>
                    <button type="button" (click)="f.times = Math.min(72, f.times + 1)" aria-label="Mais parcelas">+</button>
                  </span>
                }
              </div>
              @if (f.repeat === 'fixo') { <small class="muted">Repete todo mês pelos próximos 12 meses.</small> }
            </div>
          }
          <button type="button" class="btn ghost more-toggle" (click)="more.set(!more())" [attr.aria-expanded]="more()">
            {{ more() ? 'Menos opções' : 'Mais opções' }}<g-icon [name]="more() ? 'chevron_left' : 'expand_more'" [size]="20" />
          </button>
          <div class="more-fields" [class.open]="more()">
            <div>
              <label class="tx-row"><span class="lbl">Tags</span><span class="tx-val"><g-icon name="sell" class="muted" /><input class="bare" name="t" [(ngModel)]="f.tags" placeholder="viagem, presente…" /></span></label>
              <label class="tx-row"><span class="lbl">Observação</span><span class="tx-val"><g-icon name="notes" class="muted" /><textarea class="bare" name="obs" rows="2" [(ngModel)]="f.notes" placeholder="Opcional"></textarea></span></label>
            </div>
          </div>
        }
      </div>

      @if (keypad()) {
        <div class="keypad-sheet">
          <span class="grabber"></span>
          <g-keypad (key)="$event < 0 ? money()?.back() : money()?.press($event)" (done)="keypad.set(false)" />
        </div>
      }

      <footer>
        <div class="row">
          @if (draft().id) {
            <button type="button" class="btn ghost danger" (click)="remove(false)"><g-icon name="delete" [size]="18" />Excluir</button>
            @if (draft().group_id) { <button type="button" class="btn ghost danger" (click)="remove(true)">e próximos</button> }
          }
        </div>
        <button class="btn save" [disabled]="busy() || !f.cents"><g-icon name="check" [size]="22" />Salvar</button>
      </footer>
    </form>
  `,
})
export class TxForm implements OnInit {
  store = inject(Store);
  draft = input<TxDraft>({});
  /** id do primeiro lançamento salvo, ou null se cancelou/excluiu */
  close = output<string | null>();
  busy = signal(false);
  more = signal(false);
  /** celular: começa pelo teclado numérico (como no Organizze) */
  mobile = matchMedia('(max-width: 860px)').matches;
  keypad = signal(false);
  kind = signal<TxKind>('expense');
  hint = signal<{ id: string; name: string } | null>(null);
  money = viewChild(Money);
  fmt = (c: number) => brl(Math.round(c));
  private timer?: ReturnType<typeof setTimeout>;

  f = {
    description: '', cents: 0, date: today(), paid: true,
    origin: '', to: '', category_id: '', repeat: 'none' as 'none' | 'parcelado' | 'fixo', times: 2, tags: '', notes: '',
  };

  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  title = computed(() => (this.draft().id ? 'Editar ' : 'Nova ') + ({ expense: 'despesa', income: 'receita', transfer: 'transferência' })[this.kind()]);

  constructor() {
    afterNextRender(() => { if (!this.mobile) this.money()?.focus(); });
  }

  // métodos (não computed): dependem de campos do formulário, que não são signals
  cats() {
    const k = this.kind() === 'income' ? 'income' : 'expense';
    const all = this.store.categories().filter((c) => c.kind === k && !c.archived);
    return all.filter((c) => !c.parent_id).flatMap((p) => [p, ...all.filter((c) => c.parent_id === p.id)]);
  }
  originName() { const [, id] = this.f.origin.split(':'); return this.store.originName().get(id) ?? ''; }
  originInstitution() {
    const [t, id] = this.f.origin.split(':');
    return (t === 'c' ? this.store.cards().find((c) => c.id === id)?.institution : this.store.accounts().find((a) => a.id === id)?.institution) ?? null;
  }
  toName() { return this.store.originName().get(this.f.to) ?? ''; }
  openKeypad() { this.keypad.set(true); }
  Math = Math;
  catOptions(): ChipOption[] {
    return this.cats().map((c) => ({ value: c.id, label: c.name, icon: catIcon(c), color: c.color, sub: !!c.parent_id }));
  }
  originOptions(): ChipOption[] {
    return [
      ...this.accounts().map((a) => ({ value: 'a:' + a.id, label: a.name, group: 'Contas', bank: { name: a.name, institution: a.institution } })),
      ...this.cards().map((c) => ({ value: 'c:' + c.id, label: c.name, group: 'Cartões de crédito', bank: { name: c.name, institution: c.institution } })),
    ];
  }
  accountOptions(prefix: string): ChipOption[] {
    return this.accounts().map((a) => ({ value: prefix + a.id, label: a.name, bank: { name: a.name, institution: a.institution } }));
  }
  catColor() { return this.store.catById().get(this.f.category_id)?.color ?? 'var(--muted)'; }
  catIconName() { return this.f.category_id ? catIcon(this.store.catById().get(this.f.category_id)) : 'category'; }

  ngOnInit() {
    const d = this.draft();
    this.kind.set(d.kind ?? (d.transfer_id ? 'transfer' : (d.amount ?? -1) > 0 ? 'income' : 'expense'));
    Object.assign(this.f, {
      description: d.description ?? '',
      cents: d.amount ? Math.abs(d.amount) : 0,
      date: d.date ?? today(),
      paid: d.paid ?? true,
      origin: d.card_id ? 'c:' + d.card_id : d.account_id ? 'a:' + d.account_id : this.accounts()[0] ? 'a:' + this.accounts()[0].id : '',
      category_id: d.category_id ?? '',
      tags: (d.tags ?? []).join(', '),
      notes: d.notes ?? '',
    });
    this.more.set(!!(d.tags?.length || d.notes));
    this.keypad.set(this.mobile && !d.id && !d.amount);
    if (!d.id && d.description) this.suggestSoon();
  }

  setKind(k: TxKind) {
    this.kind.set(k);
    if (this.f.category_id && this.store.catById().get(this.f.category_id)?.kind !== (k === 'income' ? 'income' : 'expense')) this.f.category_id = '';
  }

  /** Categoria pelo histórico: a última usada com a mesma descrição (o Organizze chama isso de "IA"). */
  suggestSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const desc = this.f.description.trim();
      if (desc.length < 3 || this.f.category_id) return this.hint.set(null);
      const { data } = await sb.from('transactions').select('category_id').ilike('description', desc.replace(/[%_\\]/g, '\\$&') + '%')
        .not('category_id', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle();
      const c = data?.category_id ? this.store.catById().get(data.category_id) : undefined;
      const k = this.kind() === 'income' ? 'income' : 'expense';
      this.hint.set(c && c.kind === k && !this.f.category_id ? { id: c.id, name: c.name } : null);
    }, 350);
  }

  private origin() {
    const [t, id] = this.f.origin.split(':');
    return { account_id: t === 'a' ? id : null, card_id: t === 'c' ? id : null };
  }

  async save() {
    const total = this.f.cents;
    if (total <= 0 || !this.f.origin) return;
    this.busy.set(true);
    try {
      const d = this.draft();
      const sign = this.kind() === 'income' ? 1 : -1;
      const tags = this.f.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const { account_id, card_id } = this.origin();
      let firstId: string;

      if (this.kind() === 'transfer') {
        if (!this.f.to || account_id === this.f.to) return notify('Escolha contas diferentes', { tone: 'error' });
        const desc = this.f.description || 'Transferência';
        if (d.id && d.transfer_id) {
          const legs = await must(sb.from('transactions').select('id, amount').eq('transfer_id', d.transfer_id));
          for (const l of legs) {
            const out = l.amount < 0;
            await must(sb.from('transactions').update({ description: desc, date: this.f.date, amount: out ? -total : total, account_id: out ? account_id : this.f.to }).eq('id', l.id));
          }
          firstId = d.id;
        } else {
          const transfer_id = crypto.randomUUID();
          const rows = await must(sb.from('transactions').insert([
            { description: desc, amount: -total, date: this.f.date, account_id, transfer_id },
            { description: desc, amount: total, date: this.f.date, account_id: this.f.to, transfer_id },
          ]).select('id'));
          firstId = rows[0].id;
        }
      } else {
        const base = {
          description: this.f.description.trim(), account_id, card_id, category_id: this.f.category_id || null,
          tags, notes: this.f.notes || null, paid: card_id ? true : this.f.paid,
        };
        if (d.id) {
          await must(sb.from('transactions').update({ ...base, amount: sign * total, date: this.f.date }).eq('id', d.id));
          firstId = d.id;
        } else {
          const n = this.f.repeat === 'parcelado' ? Math.max(2, this.f.times) : this.f.repeat === 'fixo' ? 12 : 1;
          const group_id = n > 1 ? crypto.randomUUID() : null;
          const per = this.f.repeat === 'parcelado' ? Math.floor(total / n) : total;
          const rows = Array.from({ length: n }, (_, i) => ({
            ...base,
            amount: sign * (i === 0 && this.f.repeat === 'parcelado' ? total - per * (n - 1) : per),
            date: addMonths(this.f.date, i),
            paid: i === 0 ? base.paid : !!card_id,
            group_id,
            installment: this.f.repeat === 'parcelado' ? i + 1 : null,
            installments: this.f.repeat === 'parcelado' ? n : null,
            recurring: this.f.repeat === 'fixo',
            source: d.source ?? 'manual',
          }));
          // ponytail: "fixo" gera 12 meses; estender quando precisar (ou virar tabela de recorrências)
          const saved = await must(sb.from('transactions').insert(rows).select('id'));
          firstId = saved[0].id;
        }
      }
      await this.store.load();
      notify(d.id ? 'Alterações salvas' : this.kind() === 'transfer' ? 'Transferência registrada' : 'Lançamento salvo');
      this.close.emit(firstId);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(following: boolean) {
    const d = this.draft();
    if (!d.id) return;
    const target = d.transfer_id ? { column: 'transfer_id' as const, value: d.transfer_id }
      : following && d.group_id ? { column: 'group_id' as const, value: d.group_id, fromDate: d.date! }
      : { column: 'id' as const, value: d.id };
    this.close.emit(null);
    await this.store.withUndo(following ? 'Lançamentos excluídos' : 'Lançamento excluído', target, () => {
      let q = sb.from('transactions').delete().eq(target.column, target.value);
      if ('fromDate' in target && target.fromDate) q = q.gte('date', target.fromDate);
      return must(q);
    });
  }
}
