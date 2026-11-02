import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Pace, RankBars, RankItem } from '../charts';
import { BrlPipe, DmyPipe, Invoice, Store, Tx, addMonths, bankColor, brl, catIcon, hidden, monthEnd, monthLabel, monthStart, must, sb, today, toggleHidden } from '../core';
import { Icon } from '../icon';
import { BankLogo } from '../banks';

@Component({
  imports: [BrlPipe, DmyPipe, RouterLink, Icon, Pace, RankBars, BankLogo],
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
      </div>

      <div class="stack reveal">
        <section class="panel">
          <div class="panel-head"><h2>A pagar</h2><a routerLink="/lancamentos">Ver tudo <g-icon name="chevron_right" [size]="18" /></a></div>
          <div class="list">
            @for (t of bills(); track t.id) {
              <div class="item">
                <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"><span class="ms">{{ icon(t) }}</span></span>
                <div class="grow">
                  <div class="title">{{ t.description }}</div>
                  <div class="sub" [class.neg]="t.date < hoje">@if (t.date < hoje) {<g-icon name="warning" [size]="14" />atrasada · } vence {{ t.date | dmy: true }}</div>
                </div>
                <span class="amt">{{ -t.amount | brl }}</span>
                <button class="paid-btn" (click)="pay(t)" title="Marcar como paga"><g-icon name="check" [size]="18" /></button>
              </div>
            }
            @for (i of invoices(); track i.card_id + i.invoice_date) {
              <a class="item click" routerLink="/cartoes" [queryParams]="{ c: i.card_id }">
                <span class="cat-ico" style="--cc: var(--brand)"><span class="ms">credit_card</span></span>
                <div class="grow"><div class="title">Fatura {{ store.originName().get(i.card_id) }}</div><div class="sub">vence {{ i.invoice_date | dmy: true }}</div></div>
                <span class="amt">{{ i.due | brl }}</span>
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
                <div class="grow"><div class="title">{{ c.name }}</div><div class="sub">fatura {{ c.current_invoice_date | dmy: true }} · {{ c.current_invoice_due | brl }}</div></div>
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
  m = monthStart(this.hoje);
  monthShort = monthLabel(this.m, true).replace('.', '');
  dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  hello = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();
  loading = signal(true);
  month = signal({ income: 0, expense: 0 });
  daily = signal<{ day: string; expense: number }[]>([]);
  cats = signal<{ category_id: string | null; expense: number }[]>([]);
  bills = signal<Tx[]>([]);
  invoices = signal<(Invoice & { due: number })[]>([]);

  accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
  cards = computed(() => this.store.cards().filter((c) => !c.archived));
  total = computed(() => this.accounts().reduce((s, a) => s + a.balance, 0));
  forecast = computed(() => this.accounts().reduce((s, a) => s + a.forecast, 0) - this.invoices().filter((i) => i.invoice_date <= monthEnd(this.hoje)).reduce((s, i) => s + i.due, 0));
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
    const [mo, d, c, b, i] = await Promise.all([
      must(sb.rpc('report_by_month', { p_from: this.m, p_to: monthEnd(this.m) })),
      must(sb.rpc('report_by_day', { p_from: addMonths(this.m, -3), p_to: this.hoje })),
      must(sb.rpc('report_by_category', { p_from: this.m, p_to: monthEnd(this.m) })),
      must(sb.from('transactions').select('*').eq('paid', false).not('account_id', 'is', null).lt('amount', 0)
        .lte('date', addMonths(this.hoje, 1)).order('date').limit(6)),
      must(sb.from('invoices').select('*').gt('due', 0).gte('invoice_date', addMonths(this.hoje, -1)).lte('invoice_date', addMonths(this.hoje, 2)).order('invoice_date').limit(6)),
    ]);
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

  async pay(t: Tx) {
    this.bills.update((l) => l.filter((x) => x.id !== t.id)); // otimista
    await this.store.withUndo(`${t.description} marcada como paga`, { column: 'id', value: t.id },
      () => must(sb.from('transactions').update({ paid: true }).eq('id', t.id)));
  }
}
