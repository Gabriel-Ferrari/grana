import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Meter, Pace, RankBars, RankItem } from '../../shared/ui/charts';
import {
    BrlPipe,
    brl,
    Card,
    DmyPipe,
    Invoice,
    Store,
    Tx,
    addMonths,
    catIcon,
    hidden,
    monthEnd,
    monthLabel,
    monthStart,
    must,
    sb,
    today,
    toggleHidden,
    haptic,
    swr,
    cached,
    canAskPush,
    enablePush,
} from '../../core';
import { invoiceStatus } from '../cards/invoice';
import { Icon } from '../../shared/ui/icon';
import { BankLogo, CardArt, bankColor } from '../../shared/banks';
import { ChipOption, ChipSelect } from '../../shared/ui/fields';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

type CardId = 'ritmo' | 'onde' | 'equilibrio' | 'revisar' | 'apagar' | 'cartoes' | 'contas';
interface HomeCard {
    id: CardId;
    hidden: boolean;
}
const CARD_NAMES: Record<CardId, string> = {
    ritmo: 'Ritmo de gastos',
    onde: 'Para onde foi',
    equilibrio: 'Equilíbrio financeiro (50/30/20)',
    revisar: 'Para revisar',
    apagar: 'A pagar',
    cartoes: 'Cartões',
    contas: 'Contas',
};
const DEFAULT_LAYOUT: HomeCard[] = (['ritmo', 'onde', 'equilibrio', 'revisar', 'apagar', 'cartoes', 'contas'] as CardId[]).map((id) => ({
    id,
    hidden: false,
}));
/** layout salvo + cards novos que ainda não estavam nele */
function loadLayout(): HomeCard[] {
    try {
        const saved = (JSON.parse(localStorage.getItem('grana.home') ?? '[]') as HomeCard[]).filter((c) => c.id in CARD_NAMES);
        return [...saved, ...DEFAULT_LAYOUT.filter((d) => !saved.some((c) => c.id === d.id))];
    } catch {
        return DEFAULT_LAYOUT;
    }
}

@Component({
    imports: [
        BrlPipe,
        DmyPipe,
        RouterLink,
        Icon,
        Pace,
        RankBars,
        BankLogo,
        CardArt,
        ChipSelect,
        Meter,
        CdkDropList,
        CdkDrag,
        CdkDragHandle,
    ],
    template: `
        <div class="page-title reveal">
            <div>
                <p class="muted small" style="margin:0 0 .2rem">{{ dateLabel }}</p>
                <h1 class="greet">
                    {{ hello }}, <em>{{ store.firstName() || 'você' }}</em>
                </h1>
            </div>
            @if (store.pending()) {
                <a
                    class="chip"
                    routerLink="/notificacoes"
                    style="background:color-mix(in oklch,var(--lime) 40%,var(--surface));color:var(--on-lime);border-color:transparent"
                >
                    <g-icon name="notifications" [size]="16" [fill]="true" />{{ store.pending() }} para revisar
                </a>
            }
        </div>

        @for (c of connIssues(); track c.id) {
            <a class="banner warn reveal" routerLink="/ajustes"
                ><g-icon name="warning" [fill]="true" />
                <span
                    ><b>{{ c.connector || 'Banco' }} precisa de atenção</b> —
                    {{ c.error || 'a autorização venceu ou foi negada. Toque para reconectar.' }}</span
                ><g-icon name="chevron_right"
            /></a>
        }

        @if (late().n || lateInvs().length) {
            <a class="banner warn reveal" href="#a-pagar" (click)="$event.preventDefault(); toBills()"
                ><g-icon name="schedule" [fill]="true" />
                <span
                    ><b>
                        @if (late().n) {
                            {{ late().n }} {{ late().n > 1 ? 'lançamentos atrasados' : 'lançamento atrasado' }}
                        }
                        @if (late().n && lateInvs().length) {
                            e
                        }
                        @if (lateInvs().length) {
                            {{ lateInvs().length }} {{ lateInvs().length > 1 ? 'faturas vencidas' : 'fatura vencida' }}
                        }
                    </b>
                    — {{ abs(late().sum + lateInvSum()) | brl }}. Toque para ver e marcar como pago.</span
                ><g-icon name="chevron_right"
            /></a>
        }

        <div class="grid-home" [class.loading]="loading()">
            @for (col of columns(); track $index; let first = $first) {
                <div class="stack reveal">
                    @if (first) {
                        <section class="panel hero">
                            <div class="row between">
                                <span class="muted">Saldo em contas</span>
                                <button
                                    class="btn ghost icon"
                                    (click)="toggleHidden()"
                                    [attr.aria-label]="hidden() ? 'Mostrar valores' : 'Ocultar valores'"
                                >
                                    <g-icon [name]="hidden() ? 'visibility_off' : 'visibility'" />
                                </button>
                            </div>
                            <div class="hero-value" [class.neg]="total() < 0">{{ total() | brl }}</div>
                            <div class="hero-split">
                                <div>
                                    <span class="muted small">Entrou em {{ monthShort }}</span
                                    ><b><g-icon name="arrow_downward" [size]="18" />{{ month().income | brl }}</b>
                                </div>
                                <div>
                                    <span class="muted small">Saiu em {{ monthShort }}</span
                                    ><b><g-icon name="arrow_upward" [size]="18" />{{ month().expense | brl }}</b>
                                </div>
                                <div>
                                    <span class="muted small">Previsto fim do mês</span
                                    ><b [class.neg]="forecast() < 0">{{ forecast() | brl }}</b>
                                </div>
                            </div>
                        </section>
                    }
                    @for (id of col; track id) {
                        @switch (id) {
                            @case ('ritmo') {
                                <section class="panel">
                                    <div class="panel-head">
                                        <div>
                                            <h2>Ritmo de gastos</h2>
                                            <p class="muted small" style="margin:.15rem 0 0">
                                                Quanto você já gastou no mês, comparado com o normal dos últimos 3 meses
                                            </p>
                                        </div>
                                    </div>
                                    <p class="pace-verdict" [attr.data-dir]="pace().dir">
                                        <g-icon
                                            [name]="
                                                pace().dir === 'up'
                                                    ? 'trending_up'
                                                    : pace().dir === 'down'
                                                      ? 'trending_down'
                                                      : 'trending_flat'
                                            "
                                            [size]="22"
                                        />
                                        {{ pace().verdict }}
                                    </p>
                                    <p class="muted" style="margin:.2rem 0 .9rem">
                                        @if (pace().now) {
                                            Até hoje (dia {{ pace().cur.length }}) você gastou <b>{{ pace().now | brl }}</b
                                            >. Normalmente, até o dia {{ pace().cur.length }}, seriam <b>{{ pace().ref | brl }}</b
                                            >{{ paceDiff() }}.
                                        } @else {
                                            Nenhum gasto lançado neste mês ainda.
                                        }
                                    </p>
                                    <div class="pace-stats">
                                        <div>
                                            <span>Gasto até hoje</span><b>{{ pace().now | brl }}</b>
                                        </div>
                                        <div>
                                            <span>Normal até hoje</span><b>{{ pace().ref | brl }}</b>
                                        </div>
                                        <div>
                                            <span>Previsão do mês</span><b>{{ pace().forecast | brl }}</b>
                                        </div>
                                    </div>
                                    <g-pace [current]="pace().cur" [average]="pace().avg" [days]="pace().days" />
                                    <details class="table-view">
                                        <summary>Ver em tabela</summary>
                                        <table>
                                            <tr>
                                                <th>Dia</th>
                                                <th>Este mês</th>
                                                <th>Normal (3 meses)</th>
                                            </tr>
                                            @for (d of tableDays(); track d) {
                                                <tr>
                                                    <td>{{ d }}</td>
                                                    <td>{{ pace().cur[d - 1] ?? null | brl }}</td>
                                                    <td>{{ pace().avg[d - 1] | brl }}</td>
                                                </tr>
                                            }
                                        </table>
                                    </details>
                                </section>
                            }
                            @case ('onde') {
                                <section class="panel">
                                    <div class="panel-head">
                                        <h2>Para onde foi</h2>
                                        <a routerLink="/relatorios">Relatórios <g-icon name="chevron_right" [size]="18" /></a>
                                    </div>
                                    <g-rank-bars
                                        [items]="byCategory()"
                                        (pick)="openCategory($event)"
                                        empty="Nenhuma despesa neste mês ainda."
                                    />
                                </section>
                            }
                            @case ('equilibrio') {
                                <section class="panel">
                                    <div class="panel-head">
                                        <div>
                                            <h2>Equilíbrio financeiro</h2>
                                            <p class="muted small" style="margin:.15rem 0 0">
                                                Regra 50/30/20: essenciais até 50% da renda, o resto até 30%, guardar 20%
                                            </p>
                                        </div>
                                        <a routerLink="/ajustes">Essenciais <g-icon name="chevron_right" [size]="18" /></a>
                                    </div>
                                    @if (bal().inc > 0) {
                                        <div class="stack" style="gap:1rem">
                                            <g-meter label="Essenciais" [value]="bal().ess" [max]="bal().inc * 0.5" [pace]="monthPace()" />
                                            <g-meter
                                                label="Não essenciais"
                                                [value]="bal().non"
                                                [max]="bal().inc * 0.3"
                                                [pace]="monthPace()"
                                            />
                                            <p
                                                style="margin:0;font-weight:650"
                                                [class.neg]="bal().left < bal().inc * 0.2"
                                                [class.pos]="bal().left >= bal().inc * 0.2"
                                            >
                                                Sobra do mês {{ bal().left | brl }} · {{ bal().leftPct }}% da renda
                                                {{ bal().left >= bal().inc * 0.2 ? '— meta de 20% batida' : '(meta: 20%)' }}
                                            </p>
                                        </div>
                                    } @else {
                                        <div class="empty-state">
                                            <g-icon name="savings" />
                                            <div>
                                                <b>Sem renda lançada neste mês</b>Quando o salário entrar, o grana mostra quanto dá para
                                                gastar em cada lado e quanto sobra para guardar.
                                            </div>
                                        </div>
                                    }
                                </section>
                            }
                            @case ('revisar') {
                                @if (review().length) {
                                    <section class="panel review">
                                        <div class="panel-head">
                                            <div class="row">
                                                <h2>Para revisar</h2>
                                                <span class="chip blue">{{ store.toReview() }}</span>
                                            </div>
                                            <a routerLink="/revisar">Ver todos <g-icon name="chevron_right" [size]="18" /></a>
                                        </div>
                                        <p class="muted small" style="margin:-.4rem 0 .6rem">
                                            Chegaram sozinhos (notificação ou banco). Confira a categoria e aprove.
                                        </p>
                                        <div class="list">
                                            @for (t of review().slice(0, 3); track t.id) {
                                                <div
                                                    class="item click rev-item"
                                                    (click)="store.open(t)"
                                                    (keydown.enter)="store.open(t)"
                                                    tabindex="0"
                                                >
                                                    <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"
                                                        ><span class="ms">{{ icon(t) }}</span></span
                                                    >
                                                    <div class="grow">
                                                        <div class="title">{{ t.description }}</div>
                                                        <div class="sub">
                                                            {{ store.originName().get(t.account_id ?? t.card_id ?? '') }} ·
                                                            {{ t.date | dmy: true }} ·
                                                            {{ t.source === 'openfinance' ? 'banco' : 'notificação' }}
                                                        </div>
                                                        <!-- trocar a categoria aqui não abre o formulário -->
                                                        <div
                                                            class="rev-cat"
                                                            (click)="$event.stopPropagation()"
                                                            (keydown.enter)="$event.stopPropagation()"
                                                            tabindex="-1"
                                                        >
                                                            <g-chip-select
                                                                label="Sem categoria"
                                                                [options]="catOptions(t)"
                                                                [value]="t.category_id ?? ''"
                                                                (valueChange)="setCat(t, $event)"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div class="rev-side">
                                                        <span class="amt" [class.pos]="t.amount > 0" [class.neg]="t.amount < 0">{{
                                                            t.amount | brl
                                                        }}</span>
                                                        <button
                                                            class="btn rev-ok"
                                                            (click)="$event.stopPropagation(); approve(t)"
                                                            aria-label="Marcar como revisado"
                                                        >
                                                            <g-icon name="check" [size]="20" />
                                                        </button>
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                    </section>
                                }
                            }
                            @case ('apagar') {
                                <section class="panel" id="a-pagar">
                                    <div class="panel-head">
                                        <h2>A pagar</h2>
                                        <a routerLink="/lancamentos">Ver tudo <g-icon name="chevron_right" [size]="18" /></a>
                                    </div>
                                    <div class="list">
                                        @for (t of bills(); track t.id) {
                                            <div class="item click" (click)="store.open(t)" (keydown.enter)="store.open(t)" tabindex="0">
                                                <span class="cat-ico" [style.--cc]="store.catById().get(t.category_id ?? '')?.color"
                                                    ><span class="ms">{{ icon(t) }}</span></span
                                                >
                                                <div class="grow">
                                                    <div class="title">{{ t.description }}</div>
                                                    <div class="sub" [class.neg]="t.date < hoje">
                                                        @if (t.date < hoje) {
                                                            <g-icon name="warning" [size]="14" />atrasada ·
                                                        }
                                                        vence {{ t.date | dmy: true }}
                                                    </div>
                                                </div>
                                                <!-- valor e 👍 empilhados: no celular sobra espaço para o nome -->
                                                <div class="amt-col">
                                                    <span class="amt neg">{{ t.amount | brl }}</span>
                                                    <button
                                                        class="paid-btn"
                                                        (click)="$event.stopPropagation(); pay(t)"
                                                        title="Marcar como paga"
                                                        aria-label="Marcar como paga"
                                                    >
                                                        <g-icon name="thumb_up" [size]="18" />
                                                    </button>
                                                </div>
                                            </div>
                                        }
                                        @for (i of invoices(); track i.card_id + i.invoice_date) {
                                            <a class="item click" routerLink="/cartoes" [queryParams]="{ c: i.card_id }">
                                                <span class="cat-ico" style="--cc: var(--brand)"><span class="ms">credit_card</span></span>
                                                <div class="grow">
                                                    <div class="title">Fatura {{ store.originName().get(i.card_id) }}</div>
                                                    <div class="sub">vence {{ i.invoice_date | dmy: true }}</div>
                                                </div>
                                                <span class="amt neg">{{ 0 - i.due | brl }}</span>
                                            </a>
                                        }
                                        @if (!bills().length && !invoices().length) {
                                            <div class="empty-state">
                                                <g-icon name="check_circle" [fill]="true" />
                                                <div><b>Tudo em dia</b>Nada vencendo nos próximos 30 dias.</div>
                                            </div>
                                        }
                                    </div>
                                    @if (canAskPush() && bills().length) {
                                        <button type="button" class="push-ask" (click)="enablePush()">
                                            <g-icon name="notifications" [size]="20" />Avisar no celular no dia do vencimento
                                        </button>
                                    }
                                </section>
                            }
                            @case ('cartoes') {
                                <section class="panel">
                                    <div class="panel-head">
                                        <h2>Cartões</h2>
                                        <a routerLink="/cartoes">Faturas <g-icon name="chevron_right" [size]="18" /></a>
                                    </div>
                                    <!-- soma das faturas que vencem neste mês, todos os cartões -->
                                    <div class="cards-total">
                                        <div>
                                            <span>Faturas de {{ monthName() }}</span
                                            ><b [class.neg]="cardsMonth().total > 0">{{ 0 - cardsMonth().total | brl }}</b>
                                        </div>
                                        @if (cardsMonth().due !== cardsMonth().total) {
                                            <div>
                                                <span>{{ cardsMonth().due ? 'Falta pagar' : 'Situação' }}</span
                                                ><b [class.neg]="cardsMonth().due > 0" [class.pos]="!cardsMonth().due">{{
                                                    cardsMonth().due ? (0 - cardsMonth().due | brl) : 'tudo pago'
                                                }}</b>
                                            </div>
                                        }
                                    </div>
                                    <div class="list">
                                        @for (c of cards(); track c.id) {
                                            <a class="item click" routerLink="/cartoes" [queryParams]="{ c: c.id }" style="flex-wrap:wrap">
                                                <g-card-art
                                                    [name]="c.name"
                                                    [institution]="c.institution"
                                                    [color]="c.color"
                                                    [last4]="c.last4"
                                                    [width]="58"
                                                />
                                                <div class="grow">
                                                    <div class="title">{{ c.name }}</div>
                                                    <div class="sub">
                                                        @if (c.current_invoice_due > 0) {
                                                            <span [class]="'inv-' + status(c).tone">{{ status(c).text }}</span>
                                                        } @else {
                                                            fatura sem gastos
                                                        }
                                                    </div>
                                                </div>
                                                <div class="card-nums">
                                                    <div>
                                                        <span>Disponível</span><b>{{ c.available | brl }}</b>
                                                    </div>
                                                    <div>
                                                        <span>Fatura atual (venc. {{ c.current_invoice_date | dmy: true }})</span
                                                        ><b [class.neg]="c.current_invoice_due > 0">{{
                                                            0 - c.current_invoice_due | brl
                                                        }}</b>
                                                    </div>
                                                </div>
                                                <div
                                                    class="meter"
                                                    [attr.data-state]="
                                                        c.available < c.limit_cents * 0.15
                                                            ? 'over'
                                                            : c.available < c.limit_cents * 0.4
                                                              ? 'warn'
                                                              : 'ok'
                                                    "
                                                    style="width:100%;height:6px;margin:.45rem 0 0"
                                                >
                                                    <span
                                                        class="fill"
                                                        [style.width.%]="100 - (c.available / (c.limit_cents || 1)) * 100"
                                                    ></span>
                                                </div>
                                            </a>
                                        } @empty {
                                            <div class="empty-state">
                                                <g-icon name="credit_card" />
                                                <div>
                                                    <b>Sem cartões</b
                                                    ><a routerLink="/ajustes" [queryParams]="{ novo: 'cards' }" class="link-more"
                                                        >Cadastrar cartão</a
                                                    >
                                                </div>
                                            </div>
                                        }
                                    </div>
                                    <a class="btn manage-btn" routerLink="/ajustes" fragment="cartoes"
                                        ><g-icon name="tune" [size]="18" />Gerenciar cartões</a
                                    >
                                </section>
                            }
                            @case ('contas') {
                                <section class="panel">
                                    <div class="panel-head">
                                        <h2>Contas</h2>
                                        <a routerLink="/ajustes">Gerenciar <g-icon name="chevron_right" [size]="18" /></a>
                                    </div>
                                    <div class="list">
                                        @for (a of accounts(); track a.id) {
                                            <a class="item click" routerLink="/lancamentos" [queryParams]="{ o: 'a:' + a.id }">
                                                <g-bank [name]="a.name" [institution]="a.institution" />
                                                <div class="grow">
                                                    <div class="title">{{ a.name }}</div>
                                                    @if (accForecast(a); as f) {
                                                        @if (f.total !== a.balance) {
                                                            <div class="sub">
                                                                previsto fim do mês {{ f.total | brl }}
                                                                @if (f.cards) {
                                                                    · inclui fatura {{ -f.cards | brl }}
                                                                }
                                                            </div>
                                                        }
                                                    }
                                                </div>
                                                <span class="amt" [class.neg]="a.balance < 0">{{ a.balance | brl }}</span>
                                            </a>
                                        }
                                    </div>
                                </section>
                            }
                        }
                    }
                </div>
            }
        </div>

        <div class="home-custom">
            <button class="btn ghost" (click)="customizing.set(true)"><g-icon name="tune" [size]="18" />Personalizar o Início</button>
        </div>
        @if (customizing()) {
            <div class="scrim" (click)="customizing.set(false)" (keydown.escape)="customizing.set(false)" tabindex="-1"></div>
            <div class="drawer" role="dialog" aria-modal="true" aria-label="Personalizar o Início">
                <header>
                    <h2>Personalizar o Início</h2>
                    <button type="button" class="btn ghost icon" (click)="customizing.set(false)" aria-label="Fechar">
                        <g-icon name="close" />
                    </button>
                </header>
                <div class="body">
                    <p class="muted" style="margin:0">Segure a alça (≡) e arraste para mudar a ordem. O saldo fica sempre no topo.</p>
                    <div class="list reorder-list" cdkDropList cdkDropListLockAxis="y" (cdkDropListDropped)="dropCard($event)">
                        @for (c of layout(); track c.id; let i = $index; let last = $last) {
                            <div class="item custom-row" cdkDrag (cdkDragStarted)="haptic()">
                                <label class="check grow"
                                    ><input type="checkbox" [checked]="!c.hidden" (change)="toggleCard(c.id)" />{{ cardName(c.id) }}</label
                                >
                                <!-- setas: alternativa por teclado (no celular fica só a alça) -->
                                <span class="order-btns">
                                    <button class="btn ghost icon" (click)="moveCard(i, -1)" [disabled]="i === 0" aria-label="Subir">
                                        <g-icon name="arrow_upward" [size]="18" />
                                    </button>
                                    <button class="btn ghost icon" (click)="moveCard(i, 1)" [disabled]="last" aria-label="Descer">
                                        <g-icon name="arrow_downward" [size]="18" />
                                    </button>
                                </span>
                                <span class="reorder-handle" cdkDragHandle aria-hidden="true"
                                    ><g-icon name="drag_handle" [size]="22"
                                /></span>
                            </div>
                        }
                    </div>
                </div>
                <footer>
                    <button type="button" class="btn ghost" (click)="resetLayout()">Restaurar padrão</button>
                    <button type="button" class="btn primary" (click)="customizing.set(false)">
                        <g-icon name="check" [size]="18" />Pronto
                    </button>
                </footer>
            </div>
        }
    `,
})
export class Home {
    canAskPush = canAskPush;
    enablePush = () => enablePush();
    store = inject(Store);
    router = inject(Router);
    hidden = hidden;
    toggleHidden = toggleHidden;
    hoje = today();
    status = (c: Card) => invoiceStatus(c.current_invoice_date, c.closing_day, c.due_day, this.hoje);
    m = monthStart(this.hoje);
    monthShort = monthLabel(this.m, true).replace('.', '');
    dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    hello = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    })();
    loading = signal(true);
    month = signal({ income: 0, expense: 0 });
    /** 50/30/20 com as categorias marcadas como essenciais (Ajustes) */
    bal = computed(() => {
        const byId = this.store.catById();
        let ess = 0,
            non = 0;
        for (const c of this.cats()) {
            if (byId.get(c.category_id ?? '')?.essential) ess += c.expense;
            else non += c.expense;
        }
        const inc = this.month().income,
            left = inc - ess - non;
        return { inc, ess, non, left, leftPct: inc ? Math.round((left / inc) * 100) : 0 };
    });
    daily = signal<{ day: string; expense: number }[]>([]);
    cats = signal<{ category_id: string | null; expense: number }[]>([]);
    bills = signal<Tx[]>([]);
    late = signal({ n: 0, sum: 0 });
    lateInvs = computed(() => this.invoices().filter((i) => i.invoice_date < this.hoje));
    lateInvSum = computed(() => -this.lateInvs().reduce((s, i) => s + i.due, 0));
    toBills() {
        document.getElementById('a-pagar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    review = signal<Tx[]>([]);
    connIssues = signal<{ id: string; connector: string | null; error: string | null }[]>([]);
    catOptions = (t: Tx): ChipOption[] =>
        this.store
            .categories()
            .filter((c) => !c.archived && c.kind === (t.amount > 0 ? 'income' : 'expense'))
            .map((c) => ({ value: c.id, label: c.name, icon: catIcon(c), color: c.color, sub: !!c.parent_id }));
    invoices = signal<(Invoice & { due: number })[]>([]);

    accounts = computed(() => this.store.accounts().filter((a) => !a.archived));
    cards = computed(() => this.store.cards().filter((c) => !c.archived));
    /** contas que somam no saldo geral (Ajustes > conta > "Não somar no saldo geral") */
    inTotal = computed(() => this.accounts().filter((a) => !a.hide_from_total));
    total = computed(() => this.inTotal().reduce((s, a) => s + a.balance, 0));
    forecast = computed(
        () =>
            this.inTotal().reduce((s, a) => s + a.forecast, 0) -
            this.invoices()
                .filter((i) => i.invoice_date <= monthEnd(this.hoje))
                .reduce((s, i) => s + i.due, 0),
    );
    icon = (t: Tx) => catIcon(this.store.catById().get(t.category_id ?? ''));
    bank = (name: string, c: string | null) => bankColor(name, c) ?? 'var(--brand)';

    Math = Math;
    pace = computed(() => {
        const days = +monthEnd(this.m).slice(8);
        const todayN = +this.hoje.slice(8);
        const cum = (start: string, n: number) => {
            const by = new Map(
                this.daily()
                    .filter((d) => d.day.startsWith(start.slice(0, 7)))
                    .map((d) => [+d.day.slice(8), d.expense]),
            );
            let acc = 0;
            return Array.from({ length: n }, (_, i) => (acc += by.get(i + 1) ?? 0));
        };
        const cur = cum(this.m, todayN);
        // média acumulada dos 3 meses anteriores, alinhada por dia (meses curtos repetem o último valor)
        const prev = [1, 2, 3].map((k) => {
            const pm = addMonths(this.m, -k);
            return cum(pm, +monthEnd(pm).slice(8));
        });
        // "normal" = mediana dos 3 meses, dia a dia: um gasto fora da curva (entrada do apartamento) não distorce
        const med = (xs: number[]) => [...xs].sort((x, y) => x - y)[1];
        const avg = Array.from({ length: days }, (_, i) => med(prev.map((p) => p[Math.min(i, p.length - 1)] ?? 0)));
        const now = cur.at(-1) ?? 0,
            ref = avg[todayN - 1] ?? 0;
        const forecast = now + Math.max(0, (avg[days - 1] ?? 0) - ref);
        // ±10% do normal = no ritmo
        const dir: 'up' | 'down' | 'eq' = !now || !ref || Math.abs(now - ref) <= ref * 0.1 ? 'eq' : now > ref ? 'up' : 'down';
        const verdict = !now
            ? 'Nada gasto ainda'
            : dir === 'eq'
              ? 'No ritmo de sempre'
              : dir === 'up'
                ? 'Gastando mais que o normal'
                : 'Gastando menos que o normal';
        return { cur, avg, days, forecast, now, ref, dir, verdict };
    });
    abs = Math.abs;
    /** total das faturas do mês (todos os cartões) e quanto ainda falta pagar */
    cardsMonth = signal({ total: 0, due: 0 });
    monthName = computed(() => new Date(this.m + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' }));
    /** previsto da conta + faturas em aberto dos cartões que ela paga (Organizze: "conta de pagamento" do cartão) */
    accForecast(a: { id: string; forecast: number }) {
        const end = monthEnd(this.hoje);
        const cards = this.invoices()
            .filter((i) => i.invoice_date <= end && this.store.cards().find((c) => c.id === i.card_id)?.payment_account_id === a.id)
            .reduce((s, i) => s + i.due, 0);
        return { total: a.forecast - cards, cards };
    }
    /** fração do mês já passada: o medidor fica amarelo quando o gasto passa do ritmo */
    monthPace = computed(() => +this.hoje.slice(8) / +monthEnd(this.m).slice(8));
    /** cards da início: ordem e visibilidade salvas no aparelho (Organizze: "Customize os cards da sua tela inicial") */
    customizing = signal(false);
    layout = signal<HomeCard[]>(loadLayout());
    private saveLayout(l: HomeCard[]) {
        this.layout.set(l);
        localStorage.setItem('grana.home', JSON.stringify(l));
    }
    toggleCard(id: CardId) {
        this.saveLayout(this.layout().map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));
    }
    dropCard(e: CdkDragDrop<unknown>) {
        const l = [...this.layout()];
        moveItemInArray(l, e.previousIndex, e.currentIndex);
        this.saveLayout(l);
        haptic();
    }
    haptic = haptic;
    moveCard(i: number, d: number) {
        const l = [...this.layout()];
        [l[i], l[i + d]] = [l[i + d], l[i]];
        this.saveLayout(l);
    }
    resetLayout() {
        this.saveLayout(DEFAULT_LAYOUT);
    }
    cardName = (id: CardId) => CARD_NAMES[id];
    /** duas colunas no desktop (no celular viram uma só, na mesma ordem) */
    columns = computed(() => {
        const ids = this.layout()
            .filter((c) => !c.hidden)
            .map((c) => c.id);
        const k = Math.ceil(ids.length / 2);
        return [ids.slice(0, k), ids.slice(k)];
    });
    /** " (R$ X a menos)" quando foge do normal; respeita ocultar valores */
    paceDiff = computed(() => {
        const p = this.pace();
        if (p.dir === 'eq') return '';
        return ` (${hidden() ? 'R$ ••••' : brl(Math.abs(p.now - p.ref))} ${p.now > p.ref ? 'a mais' : 'a menos'})`;
    });
    tableDays = computed(() => Array.from({ length: this.pace().cur.length }, (_, i) => i + 1));
    byCategory = computed<RankItem[]>(() =>
        this.cats()
            .filter((c) => c.expense > 0)
            .map((c) => {
                const cat = this.store.catById().get(c.category_id ?? '');
                return {
                    id: c.category_id ?? '',
                    name: cat?.name ?? 'Sem categoria',
                    value: c.expense,
                    color: cat?.color,
                    icon: catIcon(cat),
                };
            }),
    );

    constructor() {
        effect(() => {
            this.store.version();
            untracked(() => this.fetch());
        });
    }

    async fetch() {
        // uma rodada só (antes eram duas em sequência = esperar a rede duas vezes) e resultado guardado (swr)
        if (!cached('home:' + this.m)) this.loading.set(true);
        await swr(
            'home:' + this.m,
            () =>
                Promise.all([
                    must(sb.from('transactions').select('*').eq('reviewed', false).order('date', { ascending: false }).limit(12)),
                    must(sb.from('pluggy_items').select('id, connector, status, error')),
                    must(sb.rpc('report_by_month', { p_from: this.m, p_to: monthEnd(this.m) })),
                    must(sb.rpc('report_by_day', { p_from: addMonths(this.m, -3), p_to: this.hoje })),
                    must(sb.rpc('report_by_category', { p_from: this.m, p_to: monthEnd(this.m) })),
                    must(
                        sb
                            .from('transactions')
                            .select('*')
                            .eq('paid', false)
                            .not('account_id', 'is', null)
                            .lt('amount', 0)
                            .lte('date', addMonths(this.hoje, 1))
                            .order('date')
                            .limit(6),
                    ),
                    must(
                        sb
                            .from('invoices')
                            .select('*')
                            .gt('due', 0)
                            .gte('invoice_date', addMonths(this.hoje, -1))
                            .lte('invoice_date', addMonths(this.hoje, 2))
                            .order('invoice_date')
                            .limit(6),
                    ),
                    // atrasados (como o banner do Organizze): pendentes em conta com data passada
                    must(
                        sb
                            .from('transactions')
                            .select('amount')
                            .eq('paid', false)
                            .not('account_id', 'is', null)
                            .is('transfer_id', null)
                            .lt('date', this.hoje),
                    ),
                    // faturas que vencem neste mês (pagas ou não): total do mês no card de cartões
                    must(sb.from('invoices').select('due, paid').gte('invoice_date', this.m).lte('invoice_date', monthEnd(this.m))),
                ]),
            ([rv, ci, mo, d, c, b, i, l, mi]) => {
                this.review.set(rv as Tx[]);
                this.connIssues.set(
                    (ci as { id: string; connector: string | null; status: string | null; error: string | null }[]).filter(
                        (x) => x.error || ['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(x.status ?? ''),
                    ),
                );
                const lr = l as { amount: number }[];
                this.late.set({ n: lr.length, sum: lr.reduce((s, r) => s + r.amount, 0) });
                const row = (mo as { income: number; expense: number }[])[0];
                this.month.set({ income: row?.income ?? 0, expense: row?.expense ?? 0 });
                this.daily.set(d as { day: string; expense: number }[]);
                this.cats.set(c as { category_id: string | null; expense: number }[]);
                this.bills.set(b as Tx[]);
                this.invoices.set(i as (Invoice & { due: number })[]);
                const mrows = mi as { due: number; paid: number }[];
                this.cardsMonth.set({
                    total: mrows.reduce((s, r) => s + Math.max(0, r.due) + Math.max(0, r.paid), 0),
                    due: mrows.reduce((s, r) => s + Math.max(0, r.due), 0),
                });
                this.loading.set(false);
            },
        );
    }

    openCategory(id: string) {
        if (id === '__other') this.router.navigate(['/relatorios']);
        else this.router.navigate(['/lancamentos'], { queryParams: { cat: id || 'none', m: this.m.slice(0, 7) } });
    }

    setCat(t: Tx, category_id: string) {
        this.review.update((l) => l.map((x) => (x.id === t.id ? { ...x, category_id: category_id || null } : x)));
        return this.store.setCat(t, category_id);
    }

    approve(t: Tx) {
        this.review.update((l) => l.filter((x) => x.id !== t.id)); // otimista
        return this.store.approve(t);
    }

    async pay(t: Tx) {
        this.bills.update((l) => l.filter((x) => x.id !== t.id)); // otimista
        await this.store.withUndo(`${t.description} marcada como paga`, { column: 'id', value: t.id }, () =>
            must(sb.from('transactions').update({ paid: true }).eq('id', t.id)),
        );
    }
}
