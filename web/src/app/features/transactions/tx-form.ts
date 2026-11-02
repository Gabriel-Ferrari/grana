import { Component, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, Tx, addMonths, brl, catIcon, invoiceDue, must, notify, sb, today } from '../../core';
import { ChipOption, ChipSelect, DatePick, Keypad, Money } from '../../shared/ui/fields';
import { Icon } from '../../shared/ui/icon';

export type TxKind = 'expense' | 'income' | 'transfer';
/** Pré-preenchimento: lançamento existente (edição) ou parcial (novo / vindo de notificação). */
export type TxDraft = Partial<Tx> & { kind?: TxKind };

@Component({
    selector: 'tx-form',
    imports: [FormsModule, Icon, Money, DatePick, Keypad, ChipSelect],
    template: `
        <div class="scrim" (click)="closed.emit(null)" (keydown.escape)="closed.emit(null)" tabindex="-1"></div>
        <form class="drawer tx" [attr.data-kind]="kind()" (ngSubmit)="save()" role="dialog" aria-modal="true" [attr.aria-label]="title()">
            <div class="tx-head">
                <div class="row between">
                    @if (!draft().id) {
                        <div class="tx-tabs" role="tablist" aria-label="Tipo">
                            <button
                                type="button"
                                role="tab"
                                [attr.aria-selected]="kind() === 'expense'"
                                [class.on]="kind() === 'expense'"
                                (click)="setKind('expense')"
                            >
                                Despesa
                            </button>
                            <button
                                type="button"
                                role="tab"
                                [attr.aria-selected]="kind() === 'income'"
                                [class.on]="kind() === 'income'"
                                (click)="setKind('income')"
                            >
                                Receita
                            </button>
                            <button
                                type="button"
                                role="tab"
                                [attr.aria-selected]="kind() === 'transfer'"
                                [class.on]="kind() === 'transfer'"
                                (click)="setKind('transfer')"
                            >
                                Transferência
                            </button>
                        </div>
                    } @else {
                        <b class="tx-title">{{ title() }}</b>
                    }
                    <button type="button" class="btn ghost icon on-k" (click)="closed.emit(null)" aria-label="Fechar">
                        <g-icon name="close" />
                    </button>
                </div>
                <div class="tx-amount" (click)="mobile && openKeypad()" (keydown.enter)="mobile && openKeypad()" tabindex="-1">
                    @if (calc(); as c) {
                        <span class="calc-expr" aria-live="polite">{{ fmt(c.acc) }} {{ c.op === '+' ? '+' : '−' }}</span>
                    }
                    <g-money [(cents)]="f.cents" inputId="valor" [keypad]="keypad()" (keydown)="calcKey($event)" />
                    @if (kind() !== 'transfer' && f.origin.startsWith('a:')) {
                        <button
                            type="button"
                            class="thumb"
                            [class.on]="f.paid"
                            (click)="$event.stopPropagation(); f.paid = !f.paid"
                            [attr.aria-pressed]="f.paid"
                            [title]="f.paid ? (kind() === 'income' ? 'Recebido' : 'Pago') : kind() === 'income' ? 'A receber' : 'A pagar'"
                        >
                            <g-icon name="thumb_up" [size]="30" [fill]="f.paid" />
                        </button>
                    }
                </div>
                @if (kind() !== 'transfer' && f.origin.startsWith('a:')) {
                    <small class="tx-paid">{{
                        f.paid ? (kind() === 'income' ? 'Recebido' : 'Pago') : kind() === 'income' ? 'A receber' : 'A pagar'
                    }}</small>
                }
                @if (f.repeat === 'parcelado' && f.cents) {
                    <small class="tx-paid">{{ f.times }}× de {{ fmt(f.cents / f.times) }}</small>
                }
            </div>

            <div class="body tx-body" (pointerdown)="keypad.set(false)">
                @if (kind() !== 'transfer') {
                    <label class="tx-row"
                        ><span class="lbl">Descrição</span>
                        <span class="tx-val"
                            ><g-icon name="edit" class="muted" /><input
                                class="bare"
                                name="d"
                                [(ngModel)]="f.description"
                                (ngModelChange)="suggestSoon()"
                                required
                                placeholder="Adicione a descrição"
                                autocomplete="off"
                        /></span>
                    </label>
                    @if (hints().length && !f.category_id) {
                        <div class="suggest-row">
                            <g-icon name="auto_awesome" [size]="16" />
                            @for (h of hints(); track h.id) {
                                <button type="button" class="suggest" (click)="f.category_id = h.id; hints.set([])">{{ h.name }}</button>
                            }
                        </div>
                    }
                    <div class="tx-row">
                        <span class="lbl">Categoria</span>
                        <g-chip-select
                            variant="row"
                            label="Categoria"
                            placeholder="Sem categoria"
                            [options]="catOptions()"
                            [(value)]="f.category_id"
                        />
                    </div>
                    <div class="tx-row">
                        <span class="lbl">{{ kind() === 'income' ? 'Recebido em' : 'Pago com' }}</span>
                        <g-chip-select
                            variant="row"
                            [label]="kind() === 'income' ? 'Recebido em' : 'Pago com'"
                            [options]="originOptions()"
                            [(value)]="f.origin"
                            [clearable]="false"
                            fallbackIcon="account_balance"
                        />
                        @if (invoiceHint(); as ih) {
                            <small class="invoice-hint"
                                ><g-icon name="credit_card" [size]="15" />Entra na fatura de <b>{{ ih }}</b></small
                            >
                        }
                    </div>
                } @else {
                    <div class="tx-row">
                        <span class="lbl">Saiu de</span>
                        <g-chip-select
                            variant="row"
                            label="Saiu de"
                            [options]="accountOptions('a:')"
                            [(value)]="f.origin"
                            [clearable]="false"
                            fallbackIcon="account_balance"
                        />
                    </div>
                    <div class="tx-row">
                        <span class="lbl">Entrou em</span>
                        <g-chip-select
                            variant="row"
                            label="Entrou em"
                            placeholder="Escolha a conta"
                            [options]="accountOptions('')"
                            [(value)]="f.to"
                            [clearable]="false"
                            fallbackIcon="account_balance"
                        />
                    </div>
                }

                <div class="tx-row"><span class="lbl">Data</span><g-date [(value)]="f.date" /></div>

                @if (kind() !== 'transfer') {
                    @if (!draft().id) {
                        <div class="tx-row">
                            <span class="lbl">Repetir lançamento</span>
                            <div class="row wrap">
                                <button
                                    type="button"
                                    class="pill"
                                    [class.on]="f.repeat === 'fixo'"
                                    (click)="f.repeat = f.repeat === 'fixo' ? 'none' : 'fixo'"
                                >
                                    <g-icon name="repeat" [size]="18" />Fixo
                                </button>
                                <button
                                    type="button"
                                    class="pill"
                                    [class.on]="f.repeat === 'parcelado'"
                                    (click)="f.repeat = f.repeat === 'parcelado' ? 'none' : 'parcelado'"
                                >
                                    <g-icon name="credit_card" [size]="18" />Parcelado
                                </button>
                                @if (f.repeat === 'parcelado') {
                                    <span class="stepper">
                                        <button type="button" (click)="f.times = Math.max(2, f.times - 1)" aria-label="Menos parcelas">
                                            −
                                        </button>
                                        <b>{{ f.times }}×</b>
                                        <button type="button" (click)="f.times = Math.min(72, f.times + 1)" aria-label="Mais parcelas">
                                            +
                                        </button>
                                    </span>
                                }
                            </div>
                            @if (f.repeat === 'parcelado') {
                                <!-- como no Organizze: cada opção mostra quantas parcelas e o valor de cada -->
                                <div class="parc-grid" role="radiogroup" aria-label="Número de parcelas">
                                    @for (n of parcOptions; track n) {
                                        <button
                                            type="button"
                                            role="radio"
                                            [attr.aria-checked]="f.times === n"
                                            [class.on]="f.times === n"
                                            (click)="f.times = n"
                                        >
                                            <b>{{ n }}x</b><span>{{ fmt(per(n)) }}</span>
                                        </button>
                                    }
                                </div>
                                <p class="parc-sum">
                                    <b>{{ f.times }}x de {{ fmt(per(f.times)) }}</b>
                                    @if (first(f.times) !== per(f.times)) {
                                        <span class="muted"> (1ª de {{ fmt(first(f.times)) }})</span>
                                    }
                                    <span class="muted"> · total {{ fmt(f.cents) }}</span>
                                </p>
                            }
                            @if (f.repeat === 'fixo') {
                                <small class="muted">Repete todo mês pelos próximos 12 meses.</small>
                            }
                        </div>
                    }
                    @if (draft().id && draft().installments; as n) {
                        <div class="tx-row">
                            <span class="lbl">Parcelado</span>
                            <p class="parc-sum" style="margin:0">
                                <b>Parcela {{ draft().installment }} de {{ n }}</b> · {{ fmt(f.cents) }} cada
                                <span class="muted"> · total ≈ {{ fmt(f.cents * n) }}</span>
                            </p>
                        </div>
                    }
                    <button type="button" class="btn ghost more-toggle" (click)="more.set(!more())" [attr.aria-expanded]="more()">
                        {{ more() ? 'Menos opções' : 'Mais opções' }}<g-icon [name]="more() ? 'chevron_left' : 'expand_more'" [size]="20" />
                    </button>
                    <div class="more-fields" [class.open]="more()">
                        <div>
                            <label class="tx-row"
                                ><span class="lbl">Tags</span
                                ><span class="tx-val"
                                    ><g-icon name="sell" class="muted" /><input
                                        class="bare"
                                        name="t"
                                        [(ngModel)]="f.tags"
                                        placeholder="viagem, presente…" /></span
                            ></label>
                            <label class="tx-row"
                                ><span class="lbl">Observação</span
                                ><span class="tx-val"
                                    ><g-icon name="notes" class="muted" /><textarea
                                        class="bare"
                                        name="obs"
                                        rows="2"
                                        [(ngModel)]="f.notes"
                                        placeholder="Opcional"
                                    ></textarea></span
                            ></label>
                            @if (store.v2()) {
                                <div class="tx-row">
                                    <span class="lbl">Anexos</span>
                                    <div class="att-list">
                                        @for (a of f.attachments; track a) {
                                            <span class="att"
                                                ><button type="button" (click)="openAtt(a)" [title]="'Abrir ' + attName(a)">
                                                    <g-icon [name]="a.endsWith('.pdf') ? 'description' : 'image'" [size]="18" />{{
                                                        attName(a)
                                                    }}
                                                </button>
                                                <button
                                                    type="button"
                                                    class="att-x"
                                                    (click)="f.attachments = f.attachments.filter((x) => x !== a)"
                                                    [attr.aria-label]="'Tirar ' + attName(a)"
                                                >
                                                    <g-icon name="close" [size]="16" /></button
                                            ></span>
                                        }
                                        <label class="btn ghost att-add"
                                            ><g-icon name="attach_file" [size]="18" />{{ uploading() ? 'Enviando…' : 'Adicionar anexo' }}
                                            <input
                                                type="file"
                                                accept="image/*,application/pdf"
                                                multiple
                                                hidden
                                                (change)="upload($event)"
                                                [disabled]="uploading()"
                                        /></label>
                                    </div>
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>

            @if (keypad()) {
                <div class="keypad-sheet">
                    <span class="grabber"></span>
                    <g-keypad
                        (key)="$event < 0 ? money()?.back() : money()?.press($event)"
                        (op)="onOp($event)"
                        (done)="onOp('='); keypad.set(false)"
                    />
                </div>
            }

            <footer>
                <div class="row">
                    @if (draft().id) {
                        <button type="button" class="btn ghost icon danger" (click)="remove(false)" aria-label="Excluir" title="Excluir">
                            <g-icon name="delete" [size]="22" />
                        </button>
                        @if (draft().group_id) {
                            <button
                                type="button"
                                class="btn ghost icon danger"
                                (click)="remove(true)"
                                aria-label="Excluir este e os próximos"
                                title="Excluir este e os próximos"
                            >
                                <g-icon name="delete_sweep" [size]="22" />
                            </button>
                        }
                        @if (kind() !== 'transfer') {
                            <button
                                type="button"
                                class="btn ghost icon"
                                (click)="duplicate()"
                                aria-label="Duplicar"
                                title="Duplicar (novo lançamento igual, com data de hoje)"
                            >
                                <g-icon name="content_copy" [size]="22" />
                            </button>
                        }
                    }
                </div>
                <div class="row">
                    @if (!draft().id) {
                        <button
                            type="button"
                            class="btn ghost"
                            [disabled]="busy() || !f.cents"
                            (click)="save(true)"
                            title="Salvar e lançar outro"
                        >
                            + Outro
                        </button>
                    }
                    <button class="btn save" [disabled]="busy() || (!f.cents && !calc())"><g-icon name="check" [size]="22" />Salvar</button>
                </div>
            </footer>
        </form>
    `,
})
export class TxForm implements OnInit {
    store = inject(Store);
    draft = input<TxDraft>({});
    /** id do primeiro lançamento salvo, ou null se cancelou/excluiu */
    /** fecha o formulário: id salvo, ou null se cancelou (não usa "close", que é evento nativo) */
    closed = output<string | null>();
    busy = signal(false);
    more = signal(false);
    /** celular: começa pelo teclado numérico (como no Organizze) */
    mobile = matchMedia('(max-width: 860px)').matches;
    keypad = signal(false);
    kind = signal<TxKind>('expense');
    hints = signal<{ id: string; name: string }[]>([]);
    topCats = signal<string[]>([]);
    money = viewChild(Money);
    fmt = (c: number) => brl(Math.round(c));
    private timer?: ReturnType<typeof setTimeout>;

    f = {
        description: '',
        cents: 0,
        date: today(),
        paid: true,
        origin: '',
        to: '',
        category_id: '',
        repeat: 'none' as 'none' | 'parcelado' | 'fixo',
        times: 2,
        tags: '',
        notes: '',
        attachments: [] as string[],
    };
    parcOptions = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];
    /** valor de cada parcela (a 1ª leva os centavos que sobram, como no save) */
    per = (n: number) => Math.floor(this.f.cents / n);
    first = (n: number) => this.f.cents - this.per(n) * (n - 1);
    uploading = signal(false);
    attName = (p: string) =>
        p
            .split('/')
            .pop()!
            .replace(/^[0-9a-f-]{36}-/, '');
    /** comprovantes: bucket privado "anexos", pasta do usuário; abre por link assinado de 10 min */
    async upload(e: Event) {
        const input = e.target as HTMLInputElement,
            uid = this.store.session()?.user.id;
        if (!uid || !input.files?.length) return;
        this.uploading.set(true);
        try {
            for (const file of Array.from(input.files)) {
                if (file.size > 10 * 1024 * 1024) {
                    notify(`${file.name}: máximo 10 MB`, { tone: 'error' });
                    continue;
                }
                const path = `${uid}/${crypto.randomUUID()}-${file.name.normalize('NFD').replace(/[^\w.-]+/g, '_')}`;
                const { error } = await sb.storage.from('anexos').upload(path, file, { contentType: file.type });
                if (error) {
                    notify(error.message, { tone: 'error' });
                    continue;
                }
                this.f.attachments = [...this.f.attachments, path];
            }
        } finally {
            this.uploading.set(false);
            input.value = '';
        }
    }
    async openAtt(path: string) {
        const { data, error } = await sb.storage.from('anexos').createSignedUrl(path, 600);
        if (error) return notify(error.message, { tone: 'error' });
        window.open(data.signedUrl, '_blank', 'noopener');
    }

    accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
    cards = computed(() => this.store.cards().filter((c) => !c.archived));
    title = computed(
        () => (this.draft().id ? 'Editar ' : 'Nova ') + { expense: 'despesa', income: 'receita', transfer: 'transferência' }[this.kind()],
    );

    constructor() {
        afterNextRender(() => {
            if (!this.mobile) this.money()?.focus();
        });
    }

    // métodos (não computed): dependem de campos do formulário, que não são signals
    cats() {
        const k = this.kind() === 'income' ? 'income' : 'expense';
        const all = this.store.categories().filter((c) => c.kind === k && !c.archived);
        return all.filter((c) => !c.parent_id).flatMap((p) => [p, ...all.filter((c) => c.parent_id === p.id)]);
    }
    originName() {
        const [, id] = this.f.origin.split(':');
        return this.store.originName().get(id) ?? '';
    }
    originInstitution() {
        const [t, id] = this.f.origin.split(':');
        return (
            (t === 'c'
                ? this.store.cards().find((c) => c.id === id)?.institution
                : this.store.accounts().find((a) => a.id === id)?.institution) ?? null
        );
    }
    toName() {
        return this.store.originName().get(this.f.to) ?? '';
    }
    openKeypad() {
        this.keypad.set(true);
    }
    Math = Math;
    catOptions(): ChipOption[] {
        const all = this.cats().map((c) => ({
            value: c.id,
            label: c.name,
            icon: catIcon(c),
            color: c.color,
            sub: !!c.parent_id,
            group: 'Todas',
        }));
        const top = this.topCats()
            .map((id) => all.find((o) => o.value === id))
            .filter((o): o is NonNullable<typeof o> => !!o)
            .map((o) => ({ ...o, group: 'Mais usadas', sub: false }));
        return top.length ? [...top, ...all] : all.map((o) => ({ ...o, group: undefined }));
    }
    invoiceHint() {
        const [t, id] = this.f.origin.split(':');
        const c = t === 'c' ? this.store.cards().find((x) => x.id === id) : undefined;
        if (!c) return null;
        const due = invoiceDue(this.f.date, c.closing_day, c.due_day);
        return new Date(due + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' }) + ` (vence ${due.slice(8)}/${due.slice(5, 7)})`;
    }
    originOptions(): ChipOption[] {
        return [
            ...this.accounts().map((a) => ({
                value: 'a:' + a.id,
                label: a.name,
                group: 'Contas',
                bank: { name: a.name, institution: a.institution },
            })),
            ...this.cards().map((c) => ({
                value: 'c:' + c.id,
                label: c.name,
                group: 'Cartões de crédito',
                bank: { name: c.name, institution: c.institution },
            })),
        ];
    }
    accountOptions(prefix: string): ChipOption[] {
        return this.accounts().map((a) => ({ value: prefix + a.id, label: a.name, bank: { name: a.name, institution: a.institution } }));
    }
    catColor() {
        return this.store.catById().get(this.f.category_id)?.color ?? 'var(--muted)';
    }
    catIconName() {
        return this.f.category_id ? catIcon(this.store.catById().get(this.f.category_id)) : 'category';
    }

    ngOnInit() {
        const d = this.draft();
        this.kind.set(d.kind ?? (d.transfer_id ? 'transfer' : (d.amount ?? -1) > 0 ? 'income' : 'expense'));
        Object.assign(this.f, {
            description: d.description ?? '',
            cents: d.amount ? Math.abs(d.amount) : 0,
            date: d.date ?? today(),
            paid: d.paid ?? true,
            origin: d.card_id
                ? 'c:' + d.card_id
                : d.account_id
                  ? 'a:' + d.account_id
                  : this.accounts()[0]
                    ? 'a:' + this.accounts()[0].id
                    : '',
            category_id: d.category_id ?? '',
            tags: (d.tags ?? []).join(', '),
            notes: d.notes ?? '',
            attachments: [...(d.attachments ?? [])],
        });
        this.more.set(!!(d.tags?.length || d.notes || d.attachments?.length));
        this.keypad.set(this.mobile && !d.id && !d.amount);
        if (!d.id && d.description) this.suggestSoon();
        sb.rpc('report_by_category', { p_from: addMonths(today(), -2), p_to: today() }).then(({ data }) =>
            this.topCats.set(
                ((data ?? []) as { category_id: string; expense: number; income: number }[])
                    .filter((r) => r.category_id)
                    .sort((a, b) => b.expense + b.income - (a.expense + a.income))
                    .slice(0, 5)
                    .map((r) => r.category_id),
            ),
        );
    }

    setKind(k: TxKind) {
        this.kind.set(k);
        if (this.f.category_id && this.store.catById().get(this.f.category_id)?.kind !== (k === 'income' ? 'income' : 'expense'))
            this.f.category_id = '';
    }

    /** Categorias pelo histórico: as mais usadas com a mesma descrição (até 3), como no YNAB. */
    suggestSoon() {
        clearTimeout(this.timer);
        this.timer = setTimeout(async () => {
            const desc = this.f.description.trim();
            if (desc.length < 3 || this.f.category_id) return this.hints.set([]);
            const { data } = await sb
                .from('transactions')
                .select('category_id')
                .ilike('description', desc.replace(/[%_\\]/g, '\\$&') + '%')
                .not('category_id', 'is', null)
                .order('date', { ascending: false })
                .limit(40);
            const k = this.kind() === 'income' ? 'income' : 'expense';
            const count = new Map<string, number>();
            for (const r of data ?? []) count.set(r.category_id, (count.get(r.category_id) ?? 0) + 1);
            this.hints.set(
                [...count]
                    .sort((a, b) => b[1] - a[1])
                    .map(([id]) => this.store.catById().get(id))
                    .filter((c) => c && c.kind === k)
                    .slice(0, 3)
                    .map((c) => ({ id: c!.id, name: c!.name })),
            );
        }, 300);
    }

    private origin() {
        const [t, id] = this.f.origin.split(':');
        return { account_id: t === 'a' ? id : null, card_id: t === 'c' ? id : null };
    }

    /** calculadora do valor (como no Organizze): acumulado + operação pendente; o número digitado é o próximo termo */
    calc = signal<{ acc: number; op: '+' | '-' } | null>(null);
    onOp(o: '+' | '-' | '=' | 'C') {
        if (o === 'C') {
            this.f.cents = 0;
            this.calc.set(null);
            return;
        }
        const c = this.calc(),
            cur = this.f.cents;
        const acc = !c ? cur : !cur ? c.acc : c.op === '+' ? c.acc + cur : c.acc - cur;
        if (o === '=') {
            this.f.cents = Math.max(0, acc);
            this.calc.set(null);
        } else {
            this.calc.set({ acc, op: o });
            this.f.cents = 0;
        }
    }
    /** desktop: + − = no campo do valor */
    calcKey(e: KeyboardEvent) {
        const o = e.key === '+' ? '+' : e.key === '-' ? '-' : e.key === '=' ? '=' : null;
        if (o) {
            e.preventDefault();
            this.onOp(o);
        }
    }

    async save(another = false) {
        if (this.calc()) this.onOp('=');
        const total = this.f.cents;
        if (total <= 0 || !this.f.origin) return;
        this.busy.set(true);
        try {
            const d = this.draft();
            const sign = this.kind() === 'income' ? 1 : -1;
            const tags = this.f.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
            const { account_id, card_id } = this.origin();
            let firstId: string;

            if (this.kind() === 'transfer') {
                if (!this.f.to || account_id === this.f.to) return notify('Escolha contas diferentes', { tone: 'error' });
                const desc = this.f.description || 'Transferência';
                if (d.id && d.transfer_id) {
                    const legs = await must(sb.from('transactions').select('id, amount').eq('transfer_id', d.transfer_id));
                    for (const l of legs) {
                        const out = l.amount < 0;
                        await must(
                            sb
                                .from('transactions')
                                .update({
                                    description: desc,
                                    date: this.f.date,
                                    amount: out ? -total : total,
                                    account_id: out ? account_id : this.f.to,
                                })
                                .eq('id', l.id),
                        );
                    }
                    firstId = d.id;
                } else {
                    const transfer_id = crypto.randomUUID();
                    const rows = await must(
                        sb
                            .from('transactions')
                            .insert([
                                { description: desc, amount: -total, date: this.f.date, account_id, transfer_id },
                                { description: desc, amount: total, date: this.f.date, account_id: this.f.to, transfer_id },
                            ])
                            .select('id'),
                    );
                    firstId = rows[0].id;
                }
            } else {
                const base = {
                    description: this.f.description.trim(),
                    account_id,
                    card_id,
                    category_id: this.f.category_id || null,
                    tags,
                    notes: this.f.notes || null,
                    paid: card_id ? true : this.f.paid,
                    ...(this.f.attachments.length || d.attachments?.length ? { attachments: this.f.attachments } : {}),
                };
                if (d.id) {
                    await must(
                        sb
                            .from('transactions')
                            .update({ ...base, amount: sign * total, date: this.f.date, reviewed: true })
                            .eq('id', d.id),
                    );
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
            if (d.id && this.kind() !== 'transfer' && this.f.category_id && this.f.category_id !== d.category_id)
                void this.store.offerSameDesc({ id: d.id, description: this.f.description }, this.f.category_id);
            if (another) {
                // mantém tipo, conta e data; limpa o resto (como "salvar e incluir outro" do Meu Dinheiro)
                Object.assign(this.f, { cents: 0, description: '', category_id: '', repeat: 'none', tags: '', notes: '', attachments: [] });
                this.hints.set([]);
                if (this.mobile) this.keypad.set(true);
                else this.money()?.focus();
                return;
            }
            this.closed.emit(firstId);
        } finally {
            this.busy.set(false);
        }
    }

    /** Abre um lançamento novo com os mesmos dados (data de hoje), como no Organizze. */
    duplicate() {
        const draft: TxDraft = {
            kind: this.kind(),
            description: this.f.description,
            amount: (this.kind() === 'income' ? 1 : -1) * this.f.cents,
            date: today(),
            paid: this.f.paid,
            category_id: this.f.category_id || null,
            notes: this.f.notes || null,
            ...this.origin(),
            tags: this.f.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
        };
        this.store.form.set(null); // recria o formulário
        setTimeout(() => this.store.open(draft));
    }

    async remove(following: boolean) {
        const d = this.draft();
        if (!d.id) return;
        const target = d.transfer_id
            ? { column: 'transfer_id' as const, value: d.transfer_id }
            : following && d.group_id
              ? { column: 'group_id' as const, value: d.group_id, fromDate: d.date! }
              : { column: 'id' as const, value: d.id };
        this.closed.emit(null);
        await this.store.withUndo(following ? 'Lançamentos excluídos' : 'Lançamento excluído', target, () => {
            let q = sb.from('transactions').delete().eq(target.column, target.value);
            if ('fromDate' in target && target.fromDate) q = q.gte('date', target.fromDate);
            return must(q);
        });
    }
}
