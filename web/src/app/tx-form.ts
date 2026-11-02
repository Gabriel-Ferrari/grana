import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, Tx, addMonths, catIcon, must, notify, sb, toCents, today } from './core';
import { Icon } from './icon';

export type TxKind = 'expense' | 'income' | 'transfer';
/** Pré-preenchimento: lançamento existente (edição) ou parcial (novo / vindo de notificação). */
export type TxDraft = Partial<Tx> & { kind?: TxKind };

@Component({
  selector: 'tx-form',
  imports: [FormsModule, Icon],
  template: `
    <div class="scrim" (click)="close.emit(null)"></div>
    <form class="drawer" (ngSubmit)="save()" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      <header>
        @if (!draft().id) {
          <div class="seg kind">
            <button type="button" data-k="expense" [class.on]="kind() === 'expense'" (click)="setKind('expense')"><g-icon name="arrow_upward" [size]="17" />Despesa</button>
            <button type="button" data-k="income" [class.on]="kind() === 'income'" (click)="setKind('income')"><g-icon name="arrow_downward" [size]="17" />Receita</button>
            <button type="button" [class.on]="kind() === 'transfer'" (click)="setKind('transfer')"><g-icon name="swap_horiz" [size]="17" />Transf.</button>
          </div>
        } @else { <h2>{{ title() }}</h2> }
        <button type="button" class="btn ghost icon" (click)="close.emit(null)" aria-label="Fechar"><g-icon name="close" /></button>
      </header>

      <div class="body">
        <label>Valor
          <input #amount class="amount-input" [class]="kind()" name="v" type="number" inputmode="decimal" step="0.01" min="0.01"
                 [(ngModel)]="f.value" required placeholder="0,00" />
        </label>

        @if (kind() !== 'transfer') {
          <label>Descrição
            <input name="d" [(ngModel)]="f.description" (ngModelChange)="suggestSoon()" required placeholder="Ex.: Mercado, Uber, Salário" autocomplete="off" />
          </label>
          @if (hint(); as h) {
            <button type="button" class="suggest" (click)="f.category_id = h.id; hint.set(null)">
              <g-icon name="auto_awesome" />Usar categoria {{ h.name }}
            </button>
          }
        }

        <div class="row end">
          <label>Data <input name="dt" type="date" [(ngModel)]="f.date" required /></label>
          <div class="seg" style="align-self:flex-end">
            <button type="button" [class.on]="f.date === hoje" (click)="f.date = hoje">Hoje</button>
            <button type="button" [class.on]="f.date === ontem" (click)="f.date = ontem">Ontem</button>
          </div>
        </div>

        @if (kind() === 'transfer') {
          <div class="row">
            <label>De <select name="o" [(ngModel)]="f.origin" required>
              @for (a of accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }
            </select></label>
            <label>Para <select name="to" [(ngModel)]="f.to" required>
              <option value="" disabled>Escolha</option>
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select></label>
          </div>
        } @else {
          <label>Conta ou cartão <select name="o" [(ngModel)]="f.origin" required>
            <optgroup label="Contas">@for (a of accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }</optgroup>
            <optgroup label="Cartões de crédito">@for (c of cards(); track c.id) { <option [value]="'c:' + c.id">{{ c.name }}</option> }</optgroup>
          </select></label>
          <div class="row end">
            <span class="cat-ico" [style.--cc]="catColor()"><span class="ms">{{ catIconName() }}</span></span>
            <label>Categoria <select name="c" [(ngModel)]="f.category_id">
              <option value="">Sem categoria</option>
              @for (c of cats(); track c.id) { <option [value]="c.id">{{ c.parent_id ? '— ' : '' }}{{ c.name }}</option> }
            </select></label>
          </div>
          @if (f.origin.startsWith('a:')) {
            <label class="check"><input name="p" type="checkbox" [(ngModel)]="f.paid" /> {{ kind() === 'income' ? 'Já recebi' : 'Já paguei' }}</label>
          }

          <button type="button" class="btn ghost more-toggle" (click)="more.set(!more())">
            <g-icon name="tune" [size]="18" />{{ more() ? 'Menos opções' : 'Parcelar, repetir, tags…' }}
          </button>
          <div class="more-fields" [class.open]="more()">
            <div>
              @if (!draft().id) {
                <div class="row">
                  <label>Repetir <select name="r" [(ngModel)]="f.repeat">
                    <option value="none">Não repetir</option>
                    <option value="parcelado">Parcelado</option>
                    <option value="fixo">Fixo (todo mês, 12 meses)</option>
                  </select></label>
                  @if (f.repeat === 'parcelado') { <label>Parcelas <input name="n" type="number" min="2" max="72" [(ngModel)]="f.times" /></label> }
                </div>
                @if (f.repeat === 'parcelado' && f.value) { <small class="muted">{{ f.times }}× de R$ {{ (f.value / f.times).toFixed(2).replace('.', ',') }} — o valor acima é o total</small> }
              }
              <label>Tags <input name="t" [(ngModel)]="f.tags" placeholder="viagem, presente…" /></label>
              <label>Observação <textarea name="obs" rows="2" [(ngModel)]="f.notes"></textarea></label>
            </div>
          </div>
        }
      </div>

      <footer>
        <div class="row">
          @if (draft().id) {
            <button type="button" class="btn ghost danger" (click)="remove(false)"><g-icon name="delete" [size]="18" />Excluir</button>
            @if (draft().group_id) { <button type="button" class="btn ghost danger" (click)="remove(true)">e próximos</button> }
          }
        </div>
        <button class="btn primary" [disabled]="busy()"><g-icon name="check" [size]="18" />Salvar</button>
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
  kind = signal<TxKind>('expense');
  hint = signal<{ id: string; name: string } | null>(null);
  amount = viewChild<ElementRef<HTMLInputElement>>('amount');
  hoje = today();
  ontem = new Date(Date.parse(today() + 'T12:00:00') - 864e5).toISOString().slice(0, 10);
  private timer?: ReturnType<typeof setTimeout>;

  f = {
    description: '', value: null as number | null, date: today(), paid: true,
    origin: '', to: '', category_id: '', repeat: 'none' as 'none' | 'parcelado' | 'fixo', times: 2, tags: '', notes: '',
  };

  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  title = computed(() => (this.draft().id ? 'Editar ' : 'Nova ') + ({ expense: 'despesa', income: 'receita', transfer: 'transferência' })[this.kind()]);

  constructor() {
    afterNextRender(() => this.amount()?.nativeElement.focus());
  }

  // métodos (não computed): dependem de campos do formulário, que não são signals
  cats() {
    const k = this.kind() === 'income' ? 'income' : 'expense';
    const all = this.store.categories().filter((c) => c.kind === k && !c.archived);
    return all.filter((c) => !c.parent_id).flatMap((p) => [p, ...all.filter((c) => c.parent_id === p.id)]);
  }
  catColor() { return this.store.catById().get(this.f.category_id)?.color ?? 'var(--muted)'; }
  catIconName() { return this.f.category_id ? catIcon(this.store.catById().get(this.f.category_id)) : 'category'; }

  ngOnInit() {
    const d = this.draft();
    this.kind.set(d.kind ?? (d.transfer_id ? 'transfer' : (d.amount ?? -1) > 0 ? 'income' : 'expense'));
    Object.assign(this.f, {
      description: d.description ?? '',
      value: d.amount ? Math.abs(d.amount) / 100 : null,
      date: d.date ?? today(),
      paid: d.paid ?? true,
      origin: d.card_id ? 'c:' + d.card_id : d.account_id ? 'a:' + d.account_id : this.accounts()[0] ? 'a:' + this.accounts()[0].id : '',
      category_id: d.category_id ?? '',
      tags: (d.tags ?? []).join(', '),
      notes: d.notes ?? '',
    });
    this.more.set(!!(d.tags?.length || d.notes));
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
    const total = toCents(this.f.value ?? 0);
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
