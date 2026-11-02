import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

/**
 * Arrastar para reordenar (toque e mouse). No contêiner: `gDragList (reorder)="..."`;
 * em cada item: `data-drag-item`; na alça: `data-drag-handle` (só ela inicia o arraste, o resto rola a tela).
 * Emite { from, to }: tire o item de `from` e insira em `to` (índice já sem ele). Quem usa reordena e salva. O HTML5 drag-and-drop não funciona com toque.
 */
@Directive({ selector: '[gDragList]' })
export class DragList {
    reorder = output<{ from: number; to: number }>();
    private host = inject(ElementRef<HTMLElement>);
    private drag: { el: HTMLElement; from: number; to: number; startY: number } | null = null;

    private items() {
        return [...(this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(':scope [data-drag-item]')];
    }

    @HostListener('pointerdown', ['$event'])
    down(e: PointerEvent) {
        const handle = (e.target as HTMLElement).closest('[data-drag-handle]');
        const el = handle?.closest<HTMLElement>('[data-drag-item]');
        if (!el) return;
        e.preventDefault();
        (handle as HTMLElement).setPointerCapture(e.pointerId);
        const from = this.items().indexOf(el);
        this.drag = { el, from, to: from, startY: e.clientY };
        el.classList.add('dragging');
    }

    @HostListener('pointermove', ['$event'])
    move(e: PointerEvent) {
        const d = this.drag;
        if (!d) return;
        d.el.style.translate = `0 ${e.clientY - d.startY}px`;
        // posição de inserção entre os OUTROS itens: antes do primeiro cujo meio está abaixo do ponteiro
        const others = this.items().filter((it) => it !== d.el);
        let k = others.findIndex((it) => {
            const r = it.getBoundingClientRect();
            return e.clientY < r.top + r.height / 2;
        });
        if (k < 0) k = others.length;
        d.to = k;
        others.forEach((it, i) => {
            it.classList.toggle('drop-before', i === k);
            it.classList.toggle('drop-after', k === others.length && i === others.length - 1);
        });
    }

    @HostListener('pointerup')
    @HostListener('pointercancel')
    up() {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        d.el.style.translate = '';
        d.el.classList.remove('dragging');
        this.items().forEach((it) => it.classList.remove('drop-before', 'drop-after'));
        if (d.to !== d.from) this.reorder.emit({ from: d.from, to: d.to });
    }
}
