import { Component, ElementRef, HostListener, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { addMonths, today } from './core';
import { Icon } from './icon';
import { BankLogo } from './banks';

/** Valor em reais digitado a partir dos centavos, como no Organizze: 1 → 0,01 · 12 → 0,12 · 1234 → 12,34.
 *  Funciona com teclado virtual (lê os dígitos no evento input, não depende de keydown). */
@Component({
  selector: 'g-money',
  template: `<input #el class="money-input" [attr.inputmode]="keypad() ? 'none' : 'numeric'" autocomplete="off" [value]="text()" (input)="onInput($event)"
    (focus)="toEnd()" (click)="toEnd()" [attr.aria-label]="label()" [attr.id]="inputId()" />`,
  host: { class: 'money' },
})
export class Money {
  /** valor em centavos */
  cents = model(0);
  label = input('Valor');
  inputId = input<string | null>(null);
  /** teclado numérico próprio na tela (celular): esconde o teclado do sistema */
  keypad = input(false);
  el = viewChild.required<ElementRef<HTMLInputElement>>('el');
  text = computed(() => (this.cents() / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

  onInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(-12);
    this.cents.set(Number(digits || 0));
    input.value = this.text(); // mantém a máscara mesmo se o valor não mudou (ex.: apagou o "R$")
    this.toEnd();
  }
  toEnd() {
    const i = this.el().nativeElement;
    requestAnimationFrame(() => i.setSelectionRange(i.value.length, i.value.length));
  }
  focus() { this.el().nativeElement.focus(); }
  press(d: number) { this.cents.update((c) => (c >= 1e10 ? c : c * 10 + d)); }
  back() { this.cents.update((c) => Math.floor(c / 10)); }
}

/** Teclado numérico grande (como no Organizze) para digitar o valor no celular. */
@Component({
  selector: 'g-keypad',
  imports: [Icon],
  template: `
    <div class="keypad" role="group" aria-label="Teclado numérico com calculadora">
      @for (d of [1, 2, 3]; track d) { <button type="button" (click)="key.emit(d)">{{ d }}</button> }
      <button type="button" class="k-op" (click)="op.emit('+')" aria-label="Somar">+</button>
      @for (d of [4, 5, 6]; track d) { <button type="button" (click)="key.emit(d)">{{ d }}</button> }
      <button type="button" class="k-op" (click)="op.emit('-')" aria-label="Subtrair">−</button>
      @for (d of [7, 8, 9]; track d) { <button type="button" (click)="key.emit(d)">{{ d }}</button> }
      <button type="button" class="k-op" (click)="op.emit('=')" aria-label="Igual">=</button>
      <button type="button" class="k-done" (click)="done.emit()" aria-label="Pronto"><g-icon name="check" [size]="26" /></button>
      <button type="button" (click)="key.emit(0)">0</button>
      <button type="button" class="k-back" (click)="key.emit(-1)" aria-label="Apagar"><g-icon name="backspace" [size]="24" /></button>
      <button type="button" class="k-op" (click)="op.emit('C')" aria-label="Zerar">C</button>
    </div>
  `,
})
export class Keypad {
  key = output<number>();
  /** calculadora: soma/subtrai valores (ex.: itens da conta, desconto); C zera */
  op = output<'+' | '-' | '=' | 'C'>();
  done = output<void>();
}

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Seletor de data: atalhos Hoje/Ontem + calendário próprio (o nativo é fraco no desktop). Valor 'YYYY-MM-DD'. */
@Component({
  selector: 'g-date',
  imports: [Icon],
  template: `
    <div class="date-quick">
      <button type="button" class="pill" [class.on]="value() === hoje" (click)="pick(hoje)">Hoje</button>
      <button type="button" class="pill" [class.on]="value() === ontem" (click)="pick(ontem)">Ontem</button>
      <button type="button" class="pill grow" [class.on]="value() !== hoje && value() !== ontem" (click)="toggle()" [attr.aria-expanded]="open()">
        <g-icon name="calendar_month" [size]="18" />{{ value() !== hoje && value() !== ontem ? long() : 'Outra data' }}
      </button>
    </div>
    @if (open()) {
      <div class="cal" role="dialog" aria-label="Escolher data">
        <div class="cal-head">
          <button type="button" class="btn ghost icon" (click)="month.set(addMonths(month(), -1))" aria-label="Mês anterior"><g-icon name="chevron_left" /></button>
          <b>{{ monthName() }}</b>
          <button type="button" class="btn ghost icon" (click)="month.set(addMonths(month(), 1))" aria-label="Próximo mês"><g-icon name="chevron_right" /></button>
        </div>
        <div class="cal-grid">
          @for (w of week; track $index) { <span class="cal-w">{{ w }}</span> }
          @for (d of days(); track $index) {
            @if (d) {
              <button type="button" class="cal-d" [class.today]="d === hoje" [class.sel]="d === value()" (click)="pick(d)"
                      [attr.aria-label]="d" [attr.aria-pressed]="d === value()">{{ +d.slice(8) }}</button>
            } @else { <span></span> }
          }
        </div>
      </div>
    }
  `,
  host: { class: 'date-field' },
})
export class DatePick {
  value = model(today());
  open = signal(false);
  hoje = today();
  ontem = new Date(Date.parse(today() + 'T12:00:00') - 864e5).toISOString().slice(0, 10);
  week = WEEK;
  addMonths = addMonths;
  month = signal(this.value().slice(0, 8) + '01');
  monthName = computed(() => new Date(this.month() + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  long = computed(() => new Date(this.value() + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }));
  days = computed(() => {
    const first = new Date(this.month() + 'T12:00:00');
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const pad: (string | null)[] = Array(first.getDay()).fill(null);
    return [...pad, ...Array.from({ length: n }, (_, i) => this.month().slice(0, 8) + String(i + 1).padStart(2, '0'))];
  });

  toggle() {
    this.month.set(this.value().slice(0, 8) + '01');
    this.open.update((o) => !o);
  }
  pick(d: string) {
    this.value.set(d);
    this.open.set(false);
  }
  @HostListener('keydown.escape', ['$event'])
  esc(e: Event) { if (this.open()) { e.stopPropagation(); this.open.set(false); } }
}

export interface ChipOption { value: string; label: string; icon?: string; color?: string; bank?: { name: string; institution?: string | null }; group?: string; sub?: boolean }

/** Filtro em chip (estilo Organizze/Copilot): mostra o selecionado; abre lista de opções em chips
 *  (popover no desktop, folha de baixo no celular). Sem <select> genérico. */
@Component({
  selector: 'g-chip-select',
  imports: [BankLogo],
  template: `
    @if (variant() === 'row') {
      <button type="button" class="frow" (click)="toggle()" [attr.aria-expanded]="open()" [attr.aria-label]="label() + (current() ? ': ' + current()!.label : '')">
        @if (current()?.bank; as b) { <g-bank [name]="b.name" [institution]="b.institution" [size]="40" [fallback]="fallbackIcon()" /> }
        @else { <span class="cat-ico round" [style.--cc]="current()?.color ?? 'var(--muted)'"><span class="ms">{{ current()?.icon ?? fallbackIcon() }}</span></span> }
        <span class="frow-val" [class.placeholder]="!current()">{{ current()?.label ?? placeholder() }}</span>
        <span class="ms caret">chevron_right</span>
      </button>
    } @else {
      <button type="button" class="fchip" [class.on]="!!value()" (click)="toggle()" [attr.aria-expanded]="open()" [attr.aria-label]="label() + (current() ? ': ' + current()!.label : '')">
        @if (current(); as c) {
          @if (c.bank) { <g-bank [name]="c.bank.name" [institution]="c.bank.institution" [size]="20" /> }
          @else if (c.icon) { <span class="ms fchip-ico" [style.color]="c.color">{{ c.icon }}</span> }
          <span>{{ c.label }}</span>
        } @else { <span>{{ label() }}</span> }
        <span class="ms caret">expand_more</span>
      </button>
    }
    @if (open()) {
      <div class="fpop-scrim" (click)="open.set(false)"></div>
      <div class="fpop" role="listbox" [attr.aria-label]="label()" [style.top.px]="pos()?.top" [style.bottom.px]="pos()?.bottom" [style.left.px]="pos()?.left" [style.width.px]="pos()?.width">
        <div class="fpop-head"><b>{{ label() }}</b>
          @if (value() && clearable()) { <button type="button" class="btn ghost" (click)="pick('')">Limpar</button> }
          <button type="button" class="btn ghost icon" (click)="open.set(false)" aria-label="Fechar"><span class="ms">close</span></button></div>
        @if (options().length > 8) {
          <div class="search"><span class="ms">search</span><input [value]="q()" (input)="q.set($any($event.target).value)" placeholder="Buscar" /></div>
        }
        <div class="fpop-list">
          @for (o of filtered(); track o.value + (o.group ?? ''); let i = $index) {
            @if (o.group && o.group !== filtered()[i - 1]?.group) { <div class="fgroup">{{ o.group }}</div> }
            <button type="button" role="option" class="fopt" [class.sub]="o.sub" [class.on]="o.value === value()" [attr.aria-selected]="o.value === value()" (click)="pick(o.value)">
              @if (o.bank) { <g-bank [name]="o.bank.name" [institution]="o.bank.institution" [size]="26" /> }
              @else if (o.icon) { <span class="cat-ico sm" [style.--cc]="o.color"><span class="ms">{{ o.icon }}</span></span> }
              <span>{{ o.label }}</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  host: { class: 'fchip-wrap' },
})
export class ChipSelect {
  label = input('');
  options = input<ChipOption[]>([]);
  /** 'chip' = filtro compacto; 'row' = linha grande de formulário (como no Organizze) */
  variant = input<'chip' | 'row'>('chip');
  placeholder = input('Escolher');
  fallbackIcon = input('category');
  clearable = input(true);
  value = model('');
  open = signal(false);
  q = signal('');
  /** desktop: posição fixa calculada do chip (não é cortada por cards vizinhos); celular: folha de baixo via CSS */
  pos = signal<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  private host = inject(ElementRef<HTMLElement>);
  current = computed(() => this.options().find((o) => o.value === this.value()));
  filtered = computed(() => {
    const q = this.q().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return this.options().filter((o) => !q || o.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  });
  pick(v: string) { this.value.set(v); this.open.set(false); this.q.set(''); }
  toggle() {
    if (!this.open() && matchMedia('(min-width: 861px)').matches) {
      const r = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
      const width = Math.max(r.width, 300), left = Math.min(r.left, innerWidth - width - 12);
      const below = innerHeight - r.bottom;
      this.pos.set(below > 320 || below > r.top ? { top: r.bottom + 6, left, width } : { bottom: innerHeight - r.top + 6, left, width });
    } else this.pos.set(null);
    this.open.update((o) => !o);
  }
  @HostListener('keydown.escape') esc() { this.open.set(false); }
}
