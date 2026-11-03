// Gráficos: ranking e medidor em HTML/CSS; ritmo de gastos e entradas×saídas com Chart.js (canvas, ~50 kB gz).
// Regras da skill dataviz: um eixo só, legenda sempre, texto na cor de texto, tooltip em hover e toque,
// tabela equivalente na página. Paleta validada (validate_palette.js) em styles.css: --in / --out.
import {
    Component,
    DestroyRef,
    ElementRef,
    Signal,
    afterNextRender,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
    viewChild,
} from '@angular/core';
import {
    ArcElement,
    BarController,
    DoughnutController,
    BarElement,
    CategoryScale,
    Chart,
    ChartConfiguration,
    Filler,
    LineController,
    LineElement,
    LinearScale,
    Plugin,
    PointElement,
    ScriptableContext,
    Tooltip,
    TooltipItem,
} from 'chart.js';
import { BrlPipe, brl, hidden } from '../../core';
import { Icon } from './icon';

Chart.register(
    ArcElement,
    DoughnutController,
    LineController,
    LineElement,
    PointElement,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Filler,
    Tooltip,
);

/** Qualquer cor CSS (oklch, light-dark, nomes…) vira rgb(): pinta 1 pixel num canvas e lê de volta. */
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
function toRgb(color: string): string {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
}
/** Cor resolvida de uma variável CSS, já em rgb() (o getComputedStyle pode devolver oklch()). */
function css(v: string): string {
    const el = document.createElement('i');
    el.style.color = `var(${v})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return toRgb(c);
}
/** Mesma cor com transparência (entrada sempre rgb(), vinda de css()). */
function alpha(rgb: string, a: number): string {
    const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const money = (c: number, compact = true) => (hidden() ? '•••' : brl(c, compact));
/** celular/tablet: tocar no gráfico mostra a categoria e o valor; abrir a lista fica para o mouse (e para as linhas abaixo) */
const touch = () => matchMedia('(hover: none)').matches;

/** Tema dos gráficos, relido quando o sistema troca claro/escuro. */
function theme() {
    return {
        ink: css('--ink'),
        ink2: css('--ink-2'),
        muted: css('--muted'),
        line: css('--line'),
        surface: css('--surface'),
        in: css('--in'),
        out: css('--out'),
        font: getComputedStyle(document.body).fontFamily,
    };
}

/** Linha vertical que acompanha o ponteiro (o leitor mira na data, não numa linha de 2px). */
/** Linha vertical tracejada marcando "hoje" no gráfico de ritmo (índice em options.plugins.today.index). */
const todayLine: Plugin = {
    id: 'today',
    afterDatasetsDraw(chart) {
        const o = (chart.options.plugins as { today?: { index: number; color: string; font: string } }).today;
        if (!o || o.index < 0) return;
        const x = chart.scales['x'].getPixelForValue(o.index);
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.strokeStyle = o.color;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top + 14);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = o.color;
        ctx.font = `600 11px ${o.font}`;
        ctx.textAlign = x > chartArea.right - 30 ? 'right' : 'center';
        ctx.fillText('hoje', x, chartArea.top + 10);
        ctx.restore();
    },
};

const crosshair: Plugin = {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
        const active = chart.tooltip?.getActiveElements();
        if (!active?.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.strokeStyle = (chart.options.plugins as { crosshair?: { color: string } }).crosshair?.color ?? '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    },
};

/** Cria/atualiza um Chart.js preso ao <canvas> do componente; recria ao trocar o tema do sistema. */
function useChart(canvas: Signal<ElementRef<HTMLCanvasElement>>, build: (t: ReturnType<typeof theme>) => ChartConfiguration) {
    let chart: Chart | undefined;
    const render = () => {
        chart?.destroy();
        chart = new Chart(canvas().nativeElement, build(theme()));
    };
    const mq = matchMedia('(prefers-color-scheme: dark)');
    afterNextRender(() => {
        render();
        mq.addEventListener('change', render);
        addEventListener('grana-theme', render);
    });
    inject(DestroyRef).onDestroy(() => {
        mq.removeEventListener('change', render);
        removeEventListener('grana-theme', render);
        chart?.destroy();
    });
    return {
        /** chamar dentro de effect() depois de ler os inputs: redesenha com os dados novos */
        update: () => {
            if (!chart) return; // o primeiro desenho acontece no afterNextRender
            const cfg = build(theme());
            chart.data = cfg.data;
            chart.options = cfg.options!;
            chart.update();
        },
    };
}

const tooltipBase = (t: ReturnType<typeof theme>) => ({
    backgroundColor: t.ink,
    titleColor: t.surface,
    bodyColor: t.surface,
    padding: 12,
    cornerRadius: 12,
    boxPadding: 6,
    titleFont: { family: t.font, size: 12, weight: 600 as const },
    bodyFont: { family: t.font, size: 13, weight: 700 as const },
    usePointStyle: true,
    displayColors: true,
});

// ───────────────────────── Barras ranqueadas (para onde foi o dinheiro) ─────────────────────────
export interface RankItem {
    id: string;
    name: string;
    value: number;
    color?: string;
    icon?: string;
}

@Component({
    selector: 'g-rank-bars',
    imports: [BrlPipe],
    template: `
        <ol class="rank" [class.in]="tone() === 'in'">
            @for (it of rows(); track it.id; let i = $index) {
                <li>
                    <button
                        type="button"
                        (click)="pick.emit(it.id)"
                        [style.--i]="i"
                        [attr.aria-label]="it.name + ': ' + (it.value | brl) + ', ' + it.pct.toFixed(0) + '%'"
                    >
                        <span class="name">
                            @if (it.icon) {
                                <span class="cat-ico sm" [style.--cc]="it.color"
                                    ><span class="ms">{{ it.icon }}</span></span
                                >
                            }
                            {{ it.name }}</span
                        >
                        <span class="val"
                            >{{ it.value | brl }} <small>{{ it.pct.toFixed(0) }}%</small></span
                        >
                        <span class="track"><span class="fill" [style.width.%]="it.w"></span></span>
                    </button>
                </li>
            } @empty {
                <li class="empty">{{ empty() }}</li>
            }
        </ol>
    `,
})
export class RankBars {
    items = input<RankItem[]>([]);
    tone = input<'in' | 'out'>('out');
    max = input(7);
    empty = input('Nada no período.');
    pick = output<string>();
    rows = computed(() => {
        const all = [...this.items()].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
        const total = all.reduce((s, i) => s + i.value, 0) || 1;
        // cauda vira "Outros" (nunca mais cores/linhas do que dá pra ler)
        const head = all.slice(0, this.max());
        const tail = all.slice(this.max());
        if (tail.length)
            head.push({ id: '__other', name: `Outras ${tail.length}`, value: tail.reduce((s, i) => s + i.value, 0), icon: 'more_horiz' });
        const top = Math.max(...head.map((i) => i.value), 1);
        return head.map((i) => ({ ...i, pct: (i.value / total) * 100, w: Math.max(1.5, (i.value / top) * 100) }));
    });
}

// ───────────────────────── Ritmo de gastos: acumulado do mês, previsão e média de 3 meses ─────────────────────────
@Component({
    selector: 'g-pace',
    template: `
        <div class="legend">
            <span><i class="key cur"></i>Este mês</span>
            <span><i class="key proj"></i>Previsão</span>
            <span><i class="key avg"></i>Normal (3 meses)</span>
        </div>
        <div class="chart-box" style="height:220px"><canvas #cv role="img" [attr.aria-label]="label()"></canvas></div>
    `,
    host: { style: 'display:block' },
})
export class Pace {
    /** gasto acumulado por dia (índice 0 = dia 1), em centavos */
    current = input<number[]>([]);
    /** média acumulada dos 3 meses anteriores, dia a dia */
    average = input<number[]>([]);
    days = input(31);
    projection = computed(() => {
        const cur = this.current(),
            avg = this.average(),
            n = cur.length;
        if (!n || !avg.length) return [];
        const base = cur[n - 1],
            from = avg[n - 1] ?? 0;
        // segue o formato da média daqui até o fim do mês
        return Array.from({ length: this.days() }, (_, i) => (i < n - 1 ? null : base + Math.max(0, (avg[i] ?? avg.at(-1)!) - from)));
    });
    label = computed(() => `Gasto acumulado: ${money(this.current().at(-1) ?? 0, false)} até o dia ${this.current().length}`);
    cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
    private c = useChart(this.cv, (t) => {
        const cur = this.current(),
            n = cur.length;
        const labels = Array.from({ length: this.days() }, (_, i) => String(i + 1));
        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Este mês',
                        data: cur,
                        borderColor: t.out,
                        borderWidth: 3,
                        tension: 0.35,
                        fill: 'origin',
                        backgroundColor: (ctx: ScriptableContext<'line'>) => {
                            const { ctx: g, chartArea } = ctx.chart;
                            if (!chartArea) return alpha(t.out, 0.15);
                            const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            grad.addColorStop(0, alpha(t.out, 0.32));
                            grad.addColorStop(1, alpha(t.out, 0));
                            return grad;
                        },
                        pointRadius: cur.map((_, i) => (i === n - 1 ? 6 : 0)),
                        pointHoverRadius: 6,
                        pointBackgroundColor: t.out,
                        pointBorderColor: t.surface,
                        pointBorderWidth: 3,
                        order: 1,
                    },
                    {
                        label: 'Previsão',
                        data: this.projection(),
                        borderColor: alpha(t.out, 0.55),
                        borderWidth: 2,
                        borderDash: [6, 6],
                        tension: 0.35,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        spanGaps: false,
                        order: 2,
                    },
                    {
                        label: 'Normal',
                        data: this.average(),
                        borderColor: t.muted,
                        borderWidth: 2,
                        borderDash: [2, 5],
                        borderCapStyle: 'round',
                        tension: 0.35,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        fill: false,
                        order: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 8, right: 8 } },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: t.line },
                        ticks: {
                            color: t.muted,
                            font: { family: t.font, size: 11 },
                            autoSkip: false,
                            callback: (_v, i) => ([0, 4, 9, 14, 19, 24, this.days() - 1].includes(i) ? String(i + 1) : ''),
                        },
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: t.line },
                        ticks: { color: t.muted, font: { family: t.font, size: 11 }, maxTicksLimit: 4, callback: (v) => money(Number(v)) },
                    },
                },
                plugins: {
                    legend: { display: false },
                    crosshair: { color: alpha(t.ink2, 0.5) },
                    today: { index: n - 1, color: t.muted, font: t.font },
                    tooltip: {
                        ...tooltipBase(t),
                        filter: (item: TooltipItem<'line'>) => item.raw !== null && item.raw !== undefined,
                        callbacks: {
                            title: (items: TooltipItem<'line'>[]) => `Dia ${items[0].label}`,
                            label: (item: TooltipItem<'line'>) => ` ${money(Number(item.raw), false)}  ${item.dataset.label}`,
                        },
                    },
                } as never,
            },
            plugins: [crosshair, todayLine],
        } as ChartConfiguration;
    });
    constructor() {
        effect(() => {
            this.current();
            this.average();
            this.days();
            hidden();
            this.c.update();
        });
    }
}

// ───────────────────────── Entradas × saídas por mês (colunas + linha de resultado, mesmo eixo) ─────────────────────────
export interface FlowMonth {
    key: string;
    label: string;
    inc: number;
    exp: number;
}

@Component({
    selector: 'g-flow',
    template: `
        <div class="legend">
            <span><i class="sw in"></i>Entradas</span><span><i class="sw out"></i>Saídas</span>
            @if (showNet()) {
                <span><i class="key net"></i>Resultado</span>
            }
        </div>
        <div class="chart-box" [style.height.px]="height()">
            <canvas #cv role="img" aria-label="Entradas, saídas e resultado por período"></canvas>
        </div>
    `,
    host: { style: 'display:block' },
})
export class Flow {
    months = input<FlowMonth[]>([]);
    /** linha "Resultado": útil por mês; por dia vira ruído */
    showNet = input(true);
    height = input(260);
    active = input<string>('');
    pick = output<string>();
    cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
    private c = useChart(this.cv, (t) => {
        const m = this.months();
        const grad = (color: string) => (ctx: { chart: Chart }) => {
            const { ctx: g, chartArea } = ctx.chart;
            if (!chartArea) return color;
            const gr = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gr.addColorStop(0, color);
            gr.addColorStop(1, alpha(color, 0.55));
            return gr;
        };
        return {
            type: 'bar',
            data: {
                labels: m.map((x) => x.label),
                datasets: [
                    {
                        type: 'bar',
                        label: 'Entradas',
                        data: m.map((x) => x.inc),
                        backgroundColor: grad(t.in),
                        hoverBackgroundColor: t.in,
                        borderRadius: { topLeft: 8, topRight: 8 },
                        borderSkipped: 'bottom',
                        maxBarThickness: 26,
                        categoryPercentage: 0.62,
                        barPercentage: 0.92,
                        order: 2,
                    },
                    {
                        type: 'bar',
                        label: 'Saídas',
                        data: m.map((x) => x.exp),
                        backgroundColor: grad(t.out),
                        hoverBackgroundColor: t.out,
                        borderRadius: { topLeft: 8, topRight: 8 },
                        borderSkipped: 'bottom',
                        maxBarThickness: 26,
                        categoryPercentage: 0.62,
                        barPercentage: 0.92,
                        order: 2,
                    },
                    ...(this.showNet()
                        ? [
                              {
                                  type: 'line',
                                  label: 'Resultado',
                                  data: m.map((x) => x.inc - x.exp),
                                  borderColor: t.ink,
                                  borderWidth: 2,
                                  tension: 0.3,
                                  pointRadius: 4,
                                  pointHoverRadius: 6,
                                  pointBackgroundColor: t.surface,
                                  pointBorderColor: t.ink,
                                  pointBorderWidth: 2,
                                  order: 1,
                              },
                          ]
                        : []),
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                onHover: (e, els) => ((e.native?.target as HTMLElement).style.cursor = els.length ? 'pointer' : 'default'),
                onClick: (_e, els) => {
                    if (els.length && !touch()) this.pick.emit(m[els[0].index].key);
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: t.line },
                        ticks: {
                            color: (c) => (m[c.index]?.key === this.active() ? t.ink : t.muted),
                            font: (c) => ({ family: t.font, size: 11, weight: m[c.index]?.key === this.active() ? 700 : 500 }),
                        },
                    },
                    y: {
                        border: { display: false },
                        ticks: { color: t.muted, font: { family: t.font, size: 11 }, maxTicksLimit: 5, callback: (v) => money(Number(v)) },
                        grid: {
                            color: (c) => (c.tick.value === 0 ? alpha(t.ink2, 0.6) : t.line),
                            lineWidth: (c) => (c.tick.value === 0 ? 1.5 : 1),
                        },
                    },
                },
                plugins: {
                    legend: { display: false },
                    crosshair: { color: 'transparent' },
                    tooltip: {
                        ...tooltipBase(t),
                        callbacks: { label: (item: TooltipItem<'bar'>) => ` ${money(Number(item.raw), false)}  ${item.dataset.label}` },
                    },
                } as never,
            },
        } as ChartConfiguration;
    });
    constructor() {
        effect(() => {
            this.months();
            this.showNet();
            this.active();
            hidden();
            this.c.update();
        });
    }
}

// ───────────────────────── Medidor de limite com marcador de ritmo ─────────────────────────
@Component({
    selector: 'g-meter',
    imports: [BrlPipe, Icon],
    template: `
        <div class="meter-head">
            <span class="label">{{ label() }}</span>
            <span
                ><b>{{ value() | brl }}</b
                ><span class="muted">&nbsp;de {{ max() | brl }}</span></span
            >
        </div>
        <div
            class="meter"
            [attr.data-state]="state()"
            role="meter"
            [attr.aria-valuenow]="value()"
            [attr.aria-valuemax]="max()"
            [attr.aria-label]="label()"
        >
            <span class="fill" [style.width.%]="Math.min(100, pct())"></span>
            @if (pace() !== null) {
                <span class="pace-mark" [style.left.%]="pace()! * 100" title="ritmo ideal até hoje"></span>
            }
        </div>
        <div class="meter-foot">
            <span class="state" [attr.data-state]="state()">
                <g-icon [name]="state() === 'ok' ? 'check_circle' : state() === 'over' ? 'error' : 'warning'" [size]="15" [fill]="true" />
                {{ state() === 'over' ? 'Estourou' : state() === 'warn' ? 'Acima do ritmo' : 'No ritmo' }}
            </span>
            <span class="muted">{{ max() - value() >= 0 ? 'sobram' : 'passou' }} {{ Math.abs(max() - value()) | brl }}</span>
        </div>
    `,
})
export class Meter {
    label = input('');
    value = input(0);
    max = input(1);
    /** fração do mês já passada (0..1); null = sem marcador */
    pace = input<number | null>(null);
    Math = Math;
    pct = computed(() => (this.value() / Math.max(1, this.max())) * 100);
    state = computed(() => {
        const p = this.pct() / 100;
        if (p > 1) return 'over';
        if (this.pace() !== null && p > this.pace()! + 0.1) return 'warn';
        return 'ok';
    });
}

// ───────────────────────── Saldo nas contas ao longo do período (Balanço) ─────────────────────────
@Component({
    selector: 'g-balance',
    template: `<div class="chart-box" style="height:200px"><canvas #cv role="img" [attr.aria-label]="label()"></canvas></div>`,
    host: { style: 'display:block' },
})
export class BalanceLine {
    /** saldo no fim de cada período (centavos) */
    points = input<{ label: string; value: number }[]>([]);
    label = computed(
        () => `Saldo nas contas: de ${money(this.points()[0]?.value ?? 0, false)} a ${money(this.points().at(-1)?.value ?? 0, false)}`,
    );
    cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
    private c = useChart(this.cv, (t) => {
        const pts = this.points(),
            neg = pts.some((p) => p.value < 0);
        return {
            type: 'line',
            data: {
                labels: pts.map((p) => p.label),
                datasets: [
                    {
                        label: 'Saldo',
                        data: pts.map((p) => p.value),
                        borderColor: t.ink2,
                        borderWidth: 2,
                        tension: 0.25,
                        fill: false,
                        pointRadius: pts.map((_, i) => (i === pts.length - 1 ? 5 : 0)),
                        pointHoverRadius: 5,
                        pointBackgroundColor: t.ink2,
                        pointBorderColor: t.surface,
                        pointBorderWidth: 2,
                        segment: { borderColor: (ctx: { p1: { parsed: { y: number } } }) => (ctx.p1.parsed.y < 0 ? t.out : t.ink2) },
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300, easing: 'easeOutQuart' },
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 8, right: 8 } },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: t.line },
                        ticks: { color: t.muted, font: { family: t.font, size: 11 }, maxTicksLimit: 8, maxRotation: 0 },
                    },
                    y: {
                        beginAtZero: neg,
                        border: { display: false },
                        grid: { color: (c: { tick: { value: number } }) => (c.tick.value === 0 ? t.muted : t.line) },
                        ticks: {
                            color: t.muted,
                            font: { family: t.font, size: 11 },
                            maxTicksLimit: 4,
                            callback: (v: string | number) => money(Number(v)),
                        },
                    },
                },
                plugins: {
                    legend: { display: false },
                    crosshair: { color: alpha(t.ink2, 0.5) },
                    tooltip: {
                        ...tooltipBase(t),
                        callbacks: { label: (item: TooltipItem<'line'>) => ` Saldo ${money(Number(item.raw), false)}` },
                    },
                } as never,
            },
            plugins: [crosshair],
        } as ChartConfiguration;
    });

    constructor() {
        // redesenha quando os dados chegam (sem isso a linha ficava vazia)
        effect(() => {
            this.points();
            hidden();
            this.c.update();
        });
    }
}

// ───────────────────────── Rosca de categorias (como o relatório do Organizze) ─────────────────────────
@Component({
    selector: 'g-donut',
    template: `
        <div class="donut-box">
            <canvas #cv role="img" [attr.aria-label]="label()"></canvas>
            <div class="donut-center" aria-live="polite">
                @if (picked(); as p) {
                    <span class="donut-pick"><i class="dot" [style.background]="p.color"></i>{{ p.name }}</span
                    ><b>{{ p.value }}</b
                    ><small>{{ p.pct }}%</small>
                } @else {
                    <span>{{ caption() }}</span
                    ><b>{{ totalText() }}</b>
                }
            </div>
        </div>
    `,
    host: { style: 'display:block' },
})
export class Donut {
    items = input<RankItem[]>([]);
    caption = input('Total');
    pick = output<string>();
    /** até 7 fatias; o resto vira "Outras" (cor neutra) */
    slices = computed(() => {
        const all = this.items().filter((i) => i.value > 0);
        if (all.length <= 8) return all;
        const top = all.slice(0, 7);
        const rest = all.slice(7).reduce((s, i) => s + i.value, 0);
        return [...top, { id: '__other', name: 'Outras', value: rest, icon: 'more_horiz' } as RankItem];
    });
    total = computed(() => this.slices().reduce((s, i) => s + i.value, 0));
    totalText = computed(() => money(this.total()));
    /** fatia tocada no celular (índice), -1 = nenhuma */
    sel = signal(-1);
    picked = computed(() => {
        const s = this.slices()[this.sel()];
        return (
            s && {
                name: s.name,
                color: s.color || 'var(--muted)',
                value: money(s.value, false),
                pct: Math.round((s.value / (this.total() || 1)) * 100),
            }
        );
    });
    label = computed(() =>
        this.slices()
            .map((s) => `${s.name}: ${money(s.value, false)}`)
            .join(', '),
    );
    cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
    private c = useChart(this.cv, (t) => {
        const sl = this.slices(),
            tot = this.total() || 1;
        return {
            type: 'doughnut',
            data: {
                labels: sl.map((s) => s.name),
                datasets: [
                    {
                        data: sl.map((s) => s.value),
                        backgroundColor: sl.map((s) => s.color || t.muted),
                        borderColor: t.surface,
                        borderWidth: 2,
                        hoverOffset: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                animation: { duration: 300, easing: 'easeOutQuart' },
                onClick: (_e: unknown, els: { index: number }[]) => {
                    const i = els[0]?.index ?? -1;
                    if (touch()) this.sel.set(i === this.sel() ? -1 : i);
                    else if (sl[i]) this.pick.emit(sl[i].id);
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipBase(t),
                        enabled: !touch(),
                        callbacks: {
                            label: (item: TooltipItem<'doughnut'>) =>
                                ` ${item.label}: ${money(Number(item.raw), false)} (${Math.round((Number(item.raw) / tot) * 100)}%)`,
                        },
                    },
                } as never,
            },
        } as ChartConfiguration;
    });

    constructor() {
        effect(() => {
            this.slices();
            hidden();
            untracked(() => this.sel.set(-1)); // dados novos: volta ao total
            this.c.update();
        });
    }
}
