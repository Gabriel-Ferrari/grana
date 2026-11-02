import { Directive, ElementRef, inject, input, output } from '@angular/core';

/** Arrastar para baixo fecha a folha (celular), como nos apps nativos. Vai no puxador (cabeçalho/grabber);
 *  `gSheetDrag` aponta a folha que desce junto (vazio = o próprio elemento). Toque simples continua sendo clique. */
@Directive({
    selector: '[gSheetDrag]',
    host: {
        class: 'sheet-drag',
        '(pointerdown)': 'down($event)',
        '(pointermove)': 'move($event)',
        '(pointerup)': 'up($event)',
        '(pointercancel)': 'cancel()',
    },
})
export class SheetDrag {
    gSheetDrag = input<HTMLElement | ''>('');
    dismissed = output();
    private el = inject(ElementRef).nativeElement as HTMLElement;
    private s: { y: number; t: number; on: boolean } | null = null;
    private dragged = false;
    constructor() {
        // depois de arrastar, o clique que o navegador dispara no fim não vale (não abre teclado, não troca aba)
        this.el.addEventListener('click', (e) => this.dragged && (e.stopPropagation(), e.preventDefault()), true);
    }
    private sheet = () => this.gSheetDrag() || this.el;
    down(e: PointerEvent) {
        if (e.pointerType !== 'touch') return;
        this.s = { y: e.clientY, t: e.timeStamp, on: false };
        this.dragged = false;
    }
    move(e: PointerEvent) {
        const s = this.s;
        if (!s) return;
        const dy = e.clientY - s.y;
        if (!s.on) {
            if (dy < -8) return void (this.s = null); // para cima não fecha
            if (dy < 8) return;
            s.on = this.dragged = true;
            this.el.setPointerCapture(e.pointerId);
            this.sheet().style.transition = 'none';
        }
        this.sheet().style.translate = `0 ${Math.max(0, dy)}px`;
    }
    up(e: PointerEvent) {
        const s = this.s;
        this.s = null;
        if (!s?.on) return;
        const dy = e.clientY - s.y,
            fast = dy > 30 && dy / (e.timeStamp - s.t) > 0.6,
            sh = this.sheet();
        sh.style.transition = 'translate .2s ease-out';
        if (dy > 110 || fast) {
            sh.style.translate = '0 100%';
            setTimeout(() => this.dismissed.emit(), 170);
        } else sh.style.translate = '';
        setTimeout(() => (this.dragged = false), 350);
    }
    cancel() {
        this.s = null;
        this.sheet().style.translate = '';
    }
}
