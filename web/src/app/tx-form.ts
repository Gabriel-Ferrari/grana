import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, Tx, addMonths, must, sb, toCents, today } from './core';

export type TxKind = 'expense' | 'income' | 'transfer';
/** Pré-preenchimento: lançamento existente (edição) ou parcial (novo / vindo de notificação). */
export type TxDraft = Partial<Tx> & { kind?: TxKind };

@Component({
  selector: 'tx-form',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="close.emit(null)">
      <form class="box dialog" (click)="$event.stopPropagation()" (ngSubmit)="save()">
        <div class="row between">
          <h3>{{ draft().id ? 'Editar' : 'Nova' }} {{ f.kind === 'expense' ? 'despesa' : f.kind === 'income' ? 'receita' : 'transferência' }}</h3>
          @if (!draft().id) {
            <div class="seg">
              <button type="button" [class.on]="f.kind === 'expense'" (click)="f.kind = 'expense'">Despesa</button>
              <button type="button" [class.on]="f.kind === 'income'" (click)="f.kind = 'income'">Receita</button>
              <button type="button" [class.on]="f.kind === 'transfer'" (click)="f.kind = 'transfer'">Transferência</button>
            </div>
          }
        </div>

        <label>Descrição <input name="d" [(ngModel)]="f.description" [required]="f.kind !== 'transfer'" /></label>
        <div class="row">
          <label>Valor (R$) <input name="v" type="number" step="0.01" min="0.01" [(ngModel)]="f.value" required /></label>
          <label>Data <input name="dt" type="date" [(ngModel)]="f.date" required /></label>
        </div>

        @if (f.kind === 'transfer') {
          <div class="row">
            <label>De <select name="o" [(ngModel)]="f.origin" required>
              @for (a of accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }
            </select></label>
            <label>Para <select name="to" [(ngModel)]="f.to" required>
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select></label>
          </div>
        } @else {
          <div class="row">
            <label>Conta/Cartão <select name="o" [(ngModel)]="f.origin" required>
              <optgroup label="Contas">@for (a of accounts(); track a.id) { <option [value]="'a:' + a.id">{{ a.name }}</option> }</optgroup>
              <optgroup label="Cartões">@for (c of cards(); track c.id) { <option [value]="'c:' + c.id">{{ c.name }}</option> }</optgroup>
            </select></label>
            <label>Categoria <select name="c" [(ngModel)]="f.category_id">
              <option value="">—</option>
              @for (c of cats(); track c.id) { <option [value]="c.id">{{ c.parent_id ? '  ↳ ' : '' }}{{ c.name }}</option> }
            </select></label>
          </div>
          @if (f.origin.startsWith('a:')) {
            <label class="check"><input name="p" type="checkbox" [(ngModel)]="f.paid" /> {{ f.kind === 'income' ? 'Recebido' : 'Pago' }}</label>
          }
          @if (!draft().id) {
            <div class="row">
              <label>Repetir <select name="r" [(ngModel)]="f.repeat">
                <option value="none">Não repetir</option>
                <option value="parcelado">Parcelado</option>
                <option value="fixo">Fixo (mensal, 12 meses)</option>
              </select></label>
              @if (f.repeat === 'parcelado') {
                <label>Parcelas <input name="n" type="number" min="2" max="72" [(ngModel)]="f.times" /></label>
              }
            </div>
            @if (f.repeat === 'parcelado' && f.value) { <small class="muted">{{ f.times }}x de {{ (f.value / f.times).toFixed(2) }} (valor total dividido)</small> }
          }
          <label>Tags <input name="t" [(ngModel)]="f.tags" placeholder="separadas por vírgula" /></label>
          <label>Observação <textarea name="obs" rows="2" [(ngModel)]="f.notes"></textarea></label>
        }

        <div class="row between">
          <div class="row">
            @if (draft().id) {
              <button type="button" class="danger" (click)="remove(false)">Excluir</button>
              @if (draft().group_id) { <button type="button" class="danger" (click)="remove(true)">Excluir este e próximos</button> }
            }
          </div>
          <div class="row">
            <button type="button" (click)="close.emit(null)">Cancelar</button>
            <button class="primary" [disabled]="busy()">Salvar</button>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class TxForm implements OnInit {
  store = inject(Store);
  draft = input<TxDraft>({});
  /** id do primeiro lançamento salvo, ou null se cancelou/excluiu */
  close = output<string | null>();
  busy = signal(false);

  f = {
    kind: 'expense' as TxKind, description: '', value: null as number | null, date: today(), paid: true,
    origin: '', to: '', category_id: '', repeat: 'none' as 'none' | 'parcelado' | 'fixo', times: 2, tags: '', notes: '',
  };

  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  // método (não computed): depende de f.kind, que é campo de formulário e não signal
  cats() {
    const kind = this.f.kind === 'income' ? 'income' : 'expense';
    const all = this.store.categories().filter((c) => c.kind === kind && !c.archived);
    return all.filter((c) => !c.parent_id).flatMap((p) => [p, ...all.filter((c) => c.parent_id === p.id)]);
  }

  ngOnInit() {
    const d = this.draft();
    const kind: TxKind = d.kind ?? (d.transfer_id ? 'transfer' : (d.amount ?? -1) > 0 ? 'income' : 'expense');
    Object.assign(this.f, {
      kind,
      description: d.description ?? '',
      value: d.amount ? Math.abs(d.amount) / 100 : null,
      date: d.date ?? today(),
      paid: d.paid ?? true,
      origin: d.card_id ? 'c:' + d.card_id : d.account_id ? 'a:' + d.account_id : this.accounts()[0] ? 'a:' + this.accounts()[0].id : '',
      category_id: d.category_id ?? '',
      tags: (d.tags ?? []).join(', '),
      notes: d.notes ?? '',
    });
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
      const sign = this.f.kind === 'income' ? 1 : -1;
      const tags = this.f.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const { account_id, card_id } = this.origin();
      let firstId: string;

      if (this.f.kind === 'transfer') {
        if (account_id === this.f.to) return;
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
      this.close.emit(firstId);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(following: boolean) {
    const d = this.draft();
    if (!d.id) return;
    if (d.transfer_id) await must(sb.from('transactions').delete().eq('transfer_id', d.transfer_id));
    else if (following && d.group_id) await must(sb.from('transactions').delete().eq('group_id', d.group_id).gte('date', d.date!));
    else await must(sb.from('transactions').delete().eq('id', d.id));
    await this.store.load();
    this.close.emit(null);
  }
}
