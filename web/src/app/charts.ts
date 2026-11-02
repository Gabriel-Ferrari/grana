// Gráficos em SVG puro, seguindo a skill dataviz: marcas finas, ponta arredondada 4px e base reta,
// grade em linha fina sólida, tooltip em hover E foco, texto sempre na cor de texto (nunca na cor da série),
// tabela equivalente para leitura sem gráfico. Paleta validada (validate_palette.js) em styles.css: --in / --out.
import { Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { BrlPipe, brl, hidden } from './core';
import { Icon } from './icon';

/** Largura real do host (os gráficos desenham em px, sem distorcer texto). */
function hostWidth() {
  const el = inject(ElementRef).nativeElement as HTMLElement;
  const w = signal(600);
  afterNextRender(() => {
    const ro = new ResizeObserver(([e]) => w.set(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
  });
  return w;
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const money = (c: number) => (hidden() ? '•••' : brl(c, true));

// ───────────────────────── Barras ranqueadas (para onde foi o dinheiro) ─────────────────────────
export interface RankItem { id: string; name: string; value: number; color?: string; icon?: string }

@Component({
  selector: 'g-rank-bars',
  imports: [BrlPipe],
  template: `
    <ol class="rank" [class.in]="tone() === 'in'">
      @for (it of rows(); track it.id; let i = $index) {
        <li>
          <button type="button" (click)="pick.emit(it.id)" [style.--i]="i" [attr.aria-label]="it.name + ': ' + (it.value | brl) + ', ' + it.pct.toFixed(0) + '%'">
            <span class="name">@if (it.icon) {<span class="cat-ico sm" [style.--cc]="it.color"><span class="ms">{{ it.icon }}</span></span>}{{ it.name }}</span>
            <span class="val">{{ it.value | brl }} <small>{{ it.pct.toFixed(0) }}%</small></span>
            <span class="track"><span class="fill" [style.width.%]="it.w"></span></span>
          </button>
        </li>
      } @empty { <li class="empty">{{ empty() }}</li> }
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
    if (tail.length) head.push({ id: '__other', name: `Outras ${tail.length}`, value: tail.reduce((s, i) => s + i.value, 0), icon: 'more_horiz' });
    const top = Math.max(...head.map((i) => i.value), 1);
    return head.map((i) => ({ ...i, pct: (i.value / total) * 100, w: Math.max(1.5, (i.value / top) * 100) }));
  });
}

// ───────────────────────── Ritmo de gastos: acumulado do mês vs mês anterior ─────────────────────────
@Component({
  selector: 'g-pace',
  template: `
    @if (w(); as W) {
      <svg [attr.width]="W" [attr.height]="H + 26" class="pace" (pointermove)="move($event)" (pointerleave)="hover.set(null)"
           role="img" [attr.aria-label]="label()">
        @for (t of ticks(); track t) {
          <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y(t)" [attr.y2]="y(t)" />
          <text class="tick" [attr.x]="L - 8" [attr.y]="y(t) + 4" text-anchor="end">{{ fmt(t) }}</text>
        }
        @for (d of xTicks(); track d) {
          <text class="tick" [attr.x]="x(d)" [attr.y]="H + 18" text-anchor="middle">{{ d }}</text>
        }
        <path class="prev" [attr.d]="path(previous())" />
        <path class="area" [attr.d]="area(current())" />
        <path class="cur draw" [attr.d]="path(current())" pathLength="1" />
        @if (current().length; as n) {
          <circle class="end" [attr.cx]="x(n)" [attr.cy]="y(current()[n - 1])" r="4.5" />
          <text class="endlabel" [attr.x]="x(n) + 9" [attr.y]="y(current()[n - 1]) + 4">{{ fmt(current()[n - 1]) }}</text>
        }
        @if (hover(); as d) {
          <line class="cross" [attr.x1]="x(d)" [attr.x2]="x(d)" [attr.y1]="T" [attr.y2]="H" />
          @if (previous()[d - 1] !== undefined) { <circle class="dot-prev" [attr.cx]="x(d)" [attr.cy]="y(previous()[d - 1])" r="4" /> }
          @if (current()[d - 1] !== undefined) { <circle class="end" [attr.cx]="x(d)" [attr.cy]="y(current()[d - 1])" r="4.5" /> }
        }
      </svg>
      @if (hover(); as d) {
        <div class="tip" [style.left.px]="tipX(d)">
          <small>dia {{ d }}</small>
          @if (current()[d - 1] !== undefined) { <div><i class="key cur"></i><b>{{ fmt(current()[d - 1], false) }}</b> este mês</div> }
          @if (previous()[d - 1] !== undefined) { <div><i class="key prev"></i><b>{{ fmt(previous()[d - 1], false) }}</b> mês passado</div> }
        </div>
      }
    }
    <div class="legend"><span><i class="key cur"></i>Este mês</span><span><i class="key prev"></i>Mês passado</span></div>
  `,
  host: { style: 'display:block;position:relative' },
})
export class Pace {
  /** gasto acumulado por dia (índice 0 = dia 1), em centavos */
  current = input<number[]>([]);
  previous = input<number[]>([]);
  days = input(31);
  w = hostWidth();
  hover = signal<number | null>(null);
  readonly H = 170; readonly T = 10; readonly L = 66; readonly R = 70;

  max = computed(() => niceMax(Math.max(1, ...this.current(), ...this.previous())));
  ticks = computed(() => [0, this.max() / 2, this.max()]);
  xTicks = computed(() => [1, 10, 20, this.days()]);
  label = computed(() => {
    const c = this.current(), p = this.previous();
    return `Gasto acumulado: ${money(c.at(-1) ?? 0)} até o dia ${c.length}; mês passado no mesmo dia: ${money(p[c.length - 1] ?? 0)}`;
  });

  x = (day: number) => this.L + ((day - 1) / Math.max(1, this.days() - 1)) * (this.w() - this.L - this.R);
  y = (v: number) => this.H - (v / this.max()) * (this.H - this.T);
  fmt = (v: number, compact = true) => (hidden() ? '•••' : brl(v, compact));
  path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${this.x(i + 1).toFixed(1)},${this.y(v).toFixed(1)}`).join('');
  area = (s: number[]) => (s.length ? `${this.path(s)}L${this.x(s.length)},${this.H}L${this.x(1)},${this.H}Z` : '');
  tipX = (d: number) => Math.min(this.w() - 170, Math.max(0, this.x(d) - 80));

  move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const t = (e.clientX - r.left - this.L) / (this.w() - this.L - this.R);
    this.hover.set(Math.min(this.days(), Math.max(1, Math.round(t * (this.days() - 1)) + 1)));
  }
}

// ───────────────────────── Entradas × saídas por mês (colunas agrupadas) ─────────────────────────
export interface FlowMonth { key: string; label: string; inc: number; exp: number }

@Component({
  selector: 'g-flow',
  template: `
    <div class="legend"><span><i class="sw in"></i>Entradas</span><span><i class="sw out"></i>Saídas</span></div>
    @if (w(); as W) {
      <svg [attr.width]="W" [attr.height]="H + 26" role="img" aria-label="Entradas e saídas por mês">
        @for (t of ticks(); track t) {
          <line class="grid" [attr.x1]="L" [attr.x2]="W" [attr.y1]="y(t)" [attr.y2]="y(t)" />
          <text class="tick" [attr.x]="L - 8" [attr.y]="y(t) + 4" text-anchor="end">{{ fmt(t) }}</text>
        }
        @for (m of months(); track m.key; let i = $index) {
          <g class="col" [class.dim]="active() && active() !== m.key" tabindex="0" role="button"
             [attr.aria-label]="m.label + ': entradas ' + fmt(m.inc, false) + ', saídas ' + fmt(m.exp, false)"
             (pointerenter)="hover.set(i)" (pointerleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)"
             (click)="pick.emit(m.key)" (keydown.enter)="pick.emit(m.key)" [style.--i]="i">
            <rect class="hit" [attr.x]="band(i)" [attr.y]="T" [attr.width]="bw()" [attr.height]="H - T" />
            <path class="bar in" [attr.d]="bar(cx(i) - colW() - 1, m.inc)" />
            <path class="bar out" [attr.d]="bar(cx(i) + 1, m.exp)" />
            <text class="tick" [attr.x]="cx(i)" [attr.y]="H + 18" text-anchor="middle" [class.strong]="m.key === active()">{{ m.label }}</text>
          </g>
        }
      </svg>
      @if (hover() !== null) {
        @let m = months()[hover()!];
        <div class="tip" [style.left.px]="Math.min(W - 180, Math.max(0, cx(hover()!) - 90))">
          <small>{{ m.label }}</small>
          <div><i class="key in"></i><b>{{ fmt(m.inc, false) }}</b> entradas</div>
          <div><i class="key out"></i><b>{{ fmt(m.exp, false) }}</b> saídas</div>
          <div class="muted">resultado <b>{{ fmt(m.inc - m.exp, false) }}</b></div>
        </div>
      }
    }
  `,
  host: { style: 'display:block;position:relative' },
})
export class Flow {
  months = input<FlowMonth[]>([]);
  active = input<string>('');
  pick = output<string>();
  w = hostWidth();
  hover = signal<number | null>(null);
  Math = Math;
  readonly H = 180; readonly T = 8; readonly L = 66;

  max = computed(() => niceMax(Math.max(1, ...this.months().flatMap((m) => [m.inc, m.exp]))));
  ticks = computed(() => [0, this.max() / 2, this.max()]);
  bw = computed(() => (this.w() - this.L) / Math.max(1, this.months().length));
  colW = computed(() => Math.min(22, Math.max(6, this.bw() / 2 - 8)));
  band = (i: number) => this.L + i * this.bw();
  cx = (i: number) => this.band(i) + this.bw() / 2;
  y = (v: number) => this.H - (v / this.max()) * (this.H - this.T);
  fmt = (v: number, compact = true) => (hidden() ? '•••' : brl(v, compact));
  /** coluna com topo arredondado 4px e base reta */
  bar(x: number, v: number) {
    const w = this.colW(), y = this.y(v), r = Math.min(4, (this.H - y) / 2, w / 2);
    if (v <= 0) return '';
    return `M${x},${this.H}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${this.H}Z`;
  }
}

// ───────────────────────── Medidor de limite com marcador de ritmo ─────────────────────────
@Component({
  selector: 'g-meter',
  imports: [BrlPipe, Icon],
  template: `
    <div class="meter-head">
      <span class="label">{{ label() }}</span>
      <span><b>{{ value() | brl }}</b><span class="muted">&nbsp;de {{ max() | brl }}</span></span>
    </div>
    <div class="meter" [attr.data-state]="state()" role="meter" [attr.aria-valuenow]="value()" [attr.aria-valuemax]="max()" [attr.aria-label]="label()">
      <span class="fill" [style.width.%]="Math.min(100, pct())"></span>
      @if (pace() !== null) { <span class="pace-mark" [style.left.%]="pace()! * 100" title="ritmo ideal até hoje"></span> }
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
