import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Meter, Pace, RankBars, RankItem } from '../charts';
import { BrlPipe, Card, DmyPipe, Invoice, Store, Tx, addMonths, bankColor, brl, catIcon, hidden, notify, monthEnd, monthLabel, monthStart, must, sb, today, toggleHidden } from '../core';
import { invoiceStatus } from '../invoice';
import { Icon } from '../icon';
import { BankLogo } from '../banks';
import { ChipOption, ChipSelect } from '../fields';

@Component({
  imports: [BrlPipe, DmyPipe, RouterLink, Icon, Pace, RankBars, BankLogo, ChipSelect, Meter],
  template: `
    <div class="page-title reveal">
      <div>
        <p class="muted small" style="margin:0 0 .2rem">{{ dateLabel }}</p>
        <h1 class="greet">{{ hello }}, <em>{{ store.firstName() || 'você' }}</em></h1>
      </div>
      @if (store.pending()) {
        <a class="chip" routerLink="/notificacoes" style="background:color-mix(in oklch,var(--lime) 40%,var(--surface));color:var(--on-lime);border-color:transparent">
          <g-icon name="notifications" [size]="16" [fill]="true" />{{ store.pending() }} para revisar
        </a>
      }
    </div>

    @for (c of connIssues(); track c.id) {
      <a class="banner warn reveal" routerLink="/ajustes"><g-icon name="warning" [fill]="true" />
        <span><b>{{ c.connector || 'Banco' }} precisa de atenção</b> — {{ c.error || 'a autorização venceu ou foi negada. Toque para reconectar.' }}</span><g-icon name="chevron_right" /></a>
    }

    @if (late().n || lateInvs().length) {
      <a class="banner warn reveal" href="#a-pagar" (click)="$event.preventDefault(); toBills()"><g-icon name="schedule" [fill]="true" />
        <span><b>@if (late().n) {{{ late().n }} {{ late().n > 1 ? 'lançamentos atrasados' : 'lançamento atrasado' }}}@if (late().n && lateInvs().length) { e }@if (lateInvs().length) {{{ lateInvs().length }} {{ lateInvs().length > 1 ? 'faturas vencidas' : 'fatura vencida' }}}</b>
          — {{ late().sum + lateInvSum() | brl }}. Toque para ver e marcar como pago.</span><g-icon name="chevron_right" /></a>
    }

    <div class="grid-home" [class.loading]="loading()">
      <div class="stack reveal">
        <section class="panel hero">
          <div class="row between">
            <span class="muted">Saldo em contas</span>
            <button class="btn ghost icon" (click)="toggleHidden()" [attr.aria-label]="hidden() ? 'Mostrar valores' : 'Ocultar valores'">
              <g-icon [name]="hidden() ? 'visibility_off' : 'visibility'" />
            </button>
          </div>
          <div class="hero-value">{{ total() | brl }}</div>
          <div class="hero-split">
            <div><span class="muted small">Entrou em {{ monthShort }}</span><b><g-icon name="arrow_downward" [size]="18" />{{ month().income | brl }}</b></div>
            <div><span class="muted small">Saiu em {{ monthShort }}</span><b><g-icon name="arrow_upward" [size]="18" />{{ month().expense | brl }}</b></div>
            <div><span class="muted small">Previsto fim do mês</span><b>{{ forecast() | brl }}</b></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Ritmo de gastos</h2>
              <p class="muted small" style="margin:.15rem 0 0">Gasto acumulado no mês, comparado à média dos 3 meses anteriores</p>
            </div>
          </div>
          <div class="pace-stats">
            <div><span>Gasto até hoje</span><b>{{ pace().cur.at(-1) ?? 0 | brl }}</b></div>
            <div><span>vs. média no dia {{ pace().cur.length }}</span>
              <b class="delta" [attr.data-dir]="!(pace().cur.at(-1)) ? 'eq' : pace().diff > 0 ? 'up' : pace().diff < 0 ? 'down' : 'eq'">
                <g-icon [name]="!(pace().cur.at(-1)) ? 'trending_flat' : pace().diff > 0 ? 'trending_up' : pace().diff < 0 ? 'trending_down' : 'trending_flat'" [size]="20" />
                {{ !(pace().cur.at(-1)) ? 'nada gasto ainda' : pace().diff === 0 ? 'igual' : (pace().diff > 0 ? '+' : '−') + Math.abs(pace().diff) + '%' }}
              </b></div>
            <div><span>Previsão do mês</span><b>{{ pace().forecast | brl }}</b></div>
          </div>
          <g-pace [current]="pace().cur" [average]="pace().avg" [days]="pace().days" />
          <details class="table-view"><summary>Ver em tabela</summary>
            <table><tr><th>Dia</th><th>Este mês</th><th>Média 3 meses</th></tr>
              @for (d of tableDays(); track d) { <tr><td>{{ d }}</td><td>{{ pace().cur[d - 1] ?? null | brl }}</td><td>{{ pace().avg[d - 1] | brl }}</td></tr> }
            </table>
          </details>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Para onde foi</h2>
            <a routerLink="/relatorios">Relatórios <g-icon name="chevron_right" [size]="18" /></a>
          </div>
          <g-rank-bars [items]="byCategory()" (pick)="openCategory($event)" empty="Nenhuma despesa neste mês ainda." />
        </section>

        <section class="panel">
          <div class="panel-head"><div><h2>Equilíbrio financeiro</h2><p class="muted small" style="margin:.15rem 0 0">Regra 50/30/20: essenciais até 50% da renda, o resto até 30%, guardar 20%</p></div>
            <a routerLink="/ajustes">Essenciais <g-icon name="chevron_right" [size]="18" /></a></div>
          @if (bal().inc > 0) {
            <div class="stack" style="gap:1rem">
              <g-meter label="Essenciais" [value]="bal().ess" [max]="bal().inc * 0.5" />
              <g-meter label="Não essenciais" [value]="bal().non" [max]="bal().inc * 0.3" />
              <p style="margin:0;font-weight:650" [class.neg]="bal().left < bal().inc * 0.2" [class.pos]="bal().left >= bal().inc * 0.2">
                Sobra do mês {{ bal().left | brl }} · {{ bal().leftPct }}% da renda {{ bal().left >= bal().inc * 0.2 ? '— meta de 20% batida' : '(meta: 20%)' }}</p>
            </div>
          } @else {
            <div class="empty-state"><g-icon name="savings" /><div><b>Sem renda lançada neste mês</b>Quando o salário entrar, o grana mostra quanto dá para gastar em cada lado e quanto sobra para guardar.</div></div>
          }
        </section>
      </div>

      <div class="stack reveal">
        @if (review().length) {
          <section class="panel review">
            <div class="panel-head">
              <div class="row"><h2>Para revisar</h2><span class="chip blue">{{ review().length }}</span></div>
              <button class="btn ghost" (click)="approveAll()"><g-icon name="done_all" [size]="18" />Revisar todos</button>
            </div>
            <p class="muted small" style="margin:-.4rem 0 .6rem">Chegaram sozinhos (notificação ou banco). Confira a categoria e aprove.</p>
            <div class="list">
              @for (t of review(); track t.id) {
                <div class="item rev-item">
                  <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"><span class="ms">{{ icon(t) }}</span></span>
                  <div class="grow">
                    <div class="title">{{ t.description }}</div>
                    <div class="sub">{{ store.originName().get(t.account_id ?? t.card_id ?? '') }} · {{ t.date | dmy: true }} · {{ t.source === 'openfinance' ? 'banco' : 'notificação' }}</div>
                    <g-chip-select label="Sem categoria" [options]="catOptions(t)" [value]="t.category_id ?? ''" (valueChange)="setCat(t, $event)" />
                  </div>
                  <div class="rev-side">
                    <span class="amt" [class.pos]="t.amount > 0" [class.neg]="t.amount < 0">{{ t.amount | brl }}</span>
                    <button class="btn rev-ok" (click)="approve(t)" aria-label="Marcar como revisado"><g-icon name="check" [size]="20" /></button>
                  </div>
                </div>
              }
            </div>
          </section>
        }
        <section class="panel" id="a-pagar">
          <div class="panel-head"><h2>A pagar</h2><a routerLink="/lancamentos">Ver tudo <g-icon name="chevron_right" [size]="18" /></a></div>
          <div class="list">
            @for (t of bills(); track t.id) {
              <div class="item">
                <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"><span class="ms">{{ icon(t) }}</span></span>
                <div class="grow">
                  <div class="title">{{ t.description }}</div>
                  <div class="sub" [class.neg]="t.date < hoje">@if (t.date < hoje) {<g-icon name="warning" [size]="14" />atrasada · } vence {{ t.date | dmy: true }}</div>
                </div>
                <span class="amt neg">{{ -t.amount | brl }}</span>
                <button class="paid-btn" (click)="pay(t)" title="Marcar como paga" aria-label="Marcar como paga"><g-icon name="thumb_up" [size]="18" /></button>
              </div>
            }
            @for (i of invoices(); track i.card_id + i.invoice_date) {
              <a class="item click" routerLink="/cartoes" [queryParams]="{ c: i.card_id }">
                <span class="cat-ico" style="--cc: var(--brand)"><span class="ms">credit_card</span></span>
                <div class="grow"><div class="title">Fatura {{ store.originName().get(i.card_id) }}</div><div class="sub">vence {{ i.invoice_date | dmy: true }}</div></div>
                <span class="amt neg">{{ i.due | brl }}</span>
              </a>
            }
            @if (!bills().length && !invoices().length) {
              <div class="empty-state"><g-icon name="check_circle" [fill]="true" /><div><b>Tudo em dia</b>Nada vencendo nos próximos 30 dias.</div></div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Cartões</h2><a routerLink="/cartoes">Faturas <g-icon name="chevron_right" [size]="18" /></a></div>
          <div class="list">
            @for (c of cards(); track c.id) {
              <a class="item click" routerLink="/cartoes" [queryParams]="{ c: c.id }" style="flex-wrap:wrap">
                <g-bank [name]="c.name" [institution]="c.institution" fallback="credit_card" />
                <div class="grow"><div class="title">{{ c.name }}</div><div class="sub">@if (c.current_invoice_due > 0) {<span [class]="'inv-' + status(c).tone">{{ status(c).text }}</span> · {{ c.current_invoice_due | brl }}} @else {fatura {{ c.current_invoice_date | dmy: true }} sem gastos}</div></div>
                <span class="amt small">{{ c.available | brl }}<br /><span class="muted" style="font-weight:600">disponível</span></span>
                <div class="meter" [attr.data-state]="c.available < c.limit_cents * .15 ? 'over' : c.available < c.limit_cents * .4 ? 'warn' : 'ok'" style="width:100%;height:6px;margin:.35rem 0 0">
                  <span class="fill" [style.width.%]="100 - (c.available / (c.limit_cents || 1)) * 100"></span>
                </div>
              </a>
            } @empty { <div class="empty-state"><g-icon name="credit_card" /><div><b>Sem cartões</b><a routerLink="/ajustes" class="link-more">Cadastrar em Ajustes</a></div></div> }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Contas</h2><a routerLink="/ajustes">Gerenciar <g-icon name="chevron_right" [size]="18" /></a></div>
          <div class="list">
            @for (a of accounts(); track a.id) {
              <a class="item click" routerLink="/lancamentos" [queryParams]="{ o: 'a:' + a.id }">
                <g-bank [name]="a.name" [institution]="a.institution" />
                <div class="grow"><div class="title">{{ a.name }}</div>@if (a.forecast !== a.balance) {<div class="sub">previsto {{ a.forecast | brl }}</div>}</div>
                <span class="amt" [class.neg]="a.balance < 0">{{ a.balance | brl }}</span>
              </a>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class Home {
  store = inject(Store);
  router = inject(Router);
  hidden = hidden;
  toggleHidden = toggleHidden;
  hoje = today();
  status = (c: Card) => invoiceStatus(c.current_invoice_date, c.closing_day, c.due_day, this.hoje);
  m = monthStart(this.hoje);
  monthShort = monthLabel(this.m, true).replace('.', '');
  dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  hello = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();
  loading = signal(true);
  month = signal({ income: 0, expense: 0 });
  /** 50/30/20 com as categorias marcadas como essenciais (Ajustes) */
  bal = computed(() => {
    const byId = this.store.catById();
    let ess = 0, non = 0;
    for (const c of this.cats()) (byId.get(c.category_id ?? '')?.essential ? (ess += c.expense) : (non += c.expense));
    const inc = this.month().income, left = inc - ess - non;
    return { inc, ess, non, left, leftPct: inc ? Math.round(left / inc * 100) : 0 };
  });
  daily = signal<{ day: string; expense: number }[]>([]);
  cats = signal<{ category_id: string | null; expense: number }[]>([]);
  bills = signal<Tx[]>([]);
  late = signal({ n: 0, sum: 0 });
  lateInvs = computed(() => this.invoices().filter((i) => i.invoice_date < this.hoje));
  lateInvSum = computed(() => -this.lateInvs().reduce((s, i) => s + i.due, 0));
  toBills() { document.getElementById('a-pagar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  review = signal<Tx[]>([]);
  connIssues = signal<{ id: string; connector: string | null; error: string | null }[]>([]);
  catOptions = (t: Tx): ChipOption[] => this.store.categories()
    .filter((c) => !c.archived && c.kind === (t.amount > 0 ? 'income' : 'expense'))
    .map((c) => ({ value: c.id, label: c.name, icon: catIcon(c), color: c.color, sub: !!c.parent_id }));
  invoices = signal<(Invoice & { due: number })[]>([]);

  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  /** contas que somam no saldo geral (Ajustes > conta > "Não somar no saldo geral") */
  inTotal = computed(() => this.accounts().filter((a) => !a.hide_from_total));
  total = computed(() => this.inTotal().reduce((s, a) => s + a.balance, 0));
  forecast = computed(() => this.inTotal().reduce((s, a) => s + a.forecast, 0) - this.invoices().filter((i) => i.invoice_date <= monthEnd(this.hoje)).reduce((s, i) => s + i.due, 0));
  icon = (t: Tx) => catIcon(this.store.catById().get(t.category_id ?? ''));
  bank = (name: string, c: string | null) => bankColor(name, c) ?? 'var(--brand)';

  Math = Math;
  pace = computed(() => {
    const days = +monthEnd(this.m).slice(8);
    const todayN = +this.hoje.slice(8);
    const cum = (start: string, n: number) => {
      const by = new Map(this.daily().filter((d) => d.day.startsWith(start.slice(0, 7))).map((d) => [+d.day.slice(8), d.expense]));
      let acc = 0;
      return Array.from({ length: n }, (_, i) => (acc += by.get(i + 1) ?? 0));
    };
    const cur = cum(this.m, todayN);
    // média acumulada dos 3 meses anteriores, alinhada por dia (meses curtos repetem o último valor)
    const prev = [1, 2, 3].map((k) => { const pm = addMonths(this.m, -k); return cum(pm, +monthEnd(pm).slice(8)); });
    const avg = Array.from({ length: days }, (_, i) => Math.round(prev.reduce((s, p) => s + (p[Math.min(i, p.length - 1)] ?? 0), 0) / 3));
    const now = cur.at(-1) ?? 0, ref = avg[todayN - 1] ?? 0;
    const forecast = now + Math.max(0, (avg[days - 1] ?? 0) - ref);
    const diff = ref ? Math.round(((now - ref) / ref) * 100) : 0;
    return { cur, avg, days, forecast, diff };
  });
  tableDays = computed(() => Array.from({ length: this.pace().cur.length }, (_, i) => i + 1));
  byCategory = computed<RankItem[]>(() => this.cats().filter((c) => c.expense > 0).map((c) => {
    const cat = this.store.catById().get(c.category_id ?? '');
    return { id: c.category_id ?? '', name: cat?.name ?? 'Sem categoria', value: c.expense, color: cat?.color, icon: catIcon(cat) };
  }));

  constructor() {
    effect(() => { this.store.version(); untracked(() => this.fetch()); });
  }

  async fetch() {
    const [rv, ci] = await Promise.all([
      must(sb.from('transactions').select('*').eq('reviewed', false).order('date', { ascending: false }).limit(12)),
      must(sb.from('pluggy_items').select('id, connector, status, error')),
    ]);
    this.review.set(rv as Tx[]);
    this.connIssues.set((ci as { id: string; connector: string | null; status: string | null; error: string | null }[])
      .filter((x) => x.error || ['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(x.status ?? '')));
    const [mo, d, c, b, i, l] = await Promise.all([
      must(sb.rpc('report_by_month', { p_from: this.m, p_to: monthEnd(this.m) })),
      must(sb.rpc('report_by_day', { p_from: addMonths(this.m, -3), p_to: this.hoje })),
      must(sb.rpc('report_by_category', { p_from: this.m, p_to: monthEnd(this.m) })),
      must(sb.from('transactions').select('*').eq('paid', false).not('account_id', 'is', null).lt('amount', 0)
        .lte('date', addMonths(this.hoje, 1)).order('date').limit(6)),
      must(sb.from('invoices').select('*').gt('due', 0).gte('invoice_date', addMonths(this.hoje, -1)).lte('invoice_date', addMonths(this.hoje, 2)).order('invoice_date').limit(6)),
      // atrasados (como o banner do Organizze): pendentes em conta com data passada
      must(sb.from('transactions').select('amount').eq('paid', false).not('account_id', 'is', null).is('transfer_id', null).lt('date', this.hoje)),
    ]);
    const lr = l as { amount: number }[];
    this.late.set({ n: lr.length, sum: lr.reduce((s, r) => s + r.amount, 0) });
    const row = (mo as { income: number; expense: number }[])[0];
    this.month.set({ income: row?.income ?? 0, expense: row?.expense ?? 0 });
    this.daily.set(d as { day: string; expense: number }[]);
    this.cats.set(c as { category_id: string | null; expense: number }[]);
    this.bills.set(b as Tx[]);
    this.invoices.set(i as (Invoice & { due: number })[]);
    this.loading.set(false);
  }

  openCategory(id: string) {
    if (id === '__other') this.router.navigate(['/relatorios']);
    else this.router.navigate(['/lancamentos'], { queryParams: { cat: id || 'none', m: this.m.slice(0, 7) } });
  }

  async setCat(t: Tx, category_id: string) {
    this.review.update((l) => l.map((x) => (x.id === t.id ? { ...x, category_id: category_id || null } : x)));
    await must(sb.from('transactions').update({ category_id: category_id || null }).eq('id', t.id));
    void this.store.offerSameDesc(t, category_id);
  }

  async approve(t: Tx) {
    this.review.update((l) => l.filter((x) => x.id !== t.id)); // otimista
    await must(sb.from('transactions').update({ reviewed: true }).eq('id', t.id));
    notify(`${t.description} revisado`, { action: { label: 'Desfazer', run: async () => {
      await must(sb.from('transactions').update({ reviewed: false }).eq('id', t.id));
      await this.store.load();
    } } });
  }

  async approveAll() {
    const ids = this.review().map((t) => t.id);
    this.review.set([]);
    await must(sb.from('transactions').update({ reviewed: true }).in('id', ids));
    notify(`${ids.length} lançamentos revisados`, { action: { label: 'Desfazer', run: async () => {
      await must(sb.from('transactions').update({ reviewed: false }).in('id', ids));
      await this.store.load();
    } } });
  }

  async pay(t: Tx) {
    this.bills.update((l) => l.filter((x) => x.id !== t.id)); // otimista
    await this.store.withUndo(`${t.description} marcada como paga`, { column: 'id', value: t.id },
      () => must(sb.from('transactions').update({ paid: true }).eq('id', t.id)));
  }
}
