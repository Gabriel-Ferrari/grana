import { Pipe, PipeTransform } from '@angular/core';
import { hidden } from './ui-state';

// datas sempre 'YYYY-MM-DD' (sem fuso)
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
export function addMonths(iso: string, n: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, last));
    return first.toISOString().slice(0, 10);
}
export const monthStart = (iso: string) => iso.slice(0, 8) + '01';
export const monthEnd = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
export const monthLabel = (iso: string, short = false) =>
    new Date(iso.slice(0, 7) + '-15T12:00:00').toLocaleDateString('pt-BR', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
export const toCents = (v: number | string) => Math.round(Number(String(v).replace(',', '.')) * 100);
export const brl = (cents: number, compact = false) =>
    (cents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    });

/** Vencimento da fatura em que cai uma compra (mesma regra do banco: invoice_due). */
export function invoiceDue(date: string, closing: number, due: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    let cy = y,
        cm = m;
    if (d > Math.min(closing, last(y, m))) {
        cm++;
        if (cm > 12) {
            cm = 1;
            cy++;
        }
    }
    let dy = cy,
        dm = cm;
    if (due <= closing) {
        dm++;
        if (dm > 12) {
            dm = 1;
            dy++;
        }
    }
    return `${dy}-${String(dm).padStart(2, '0')}-${String(Math.min(due, last(dy, dm))).padStart(2, '0')}`;
}

// impuro: precisa reagir ao `hidden` sem mudar a entrada
@Pipe({ name: 'brl', pure: false })
export class BrlPipe implements PipeTransform {
    transform(cents: number | null | undefined, compact = false): string {
        return hidden() ? 'R$ ••••' : brl(cents ?? 0, compact);
    }
}

@Pipe({ name: 'dmy' })
export class DmyPipe implements PipeTransform {
    transform(iso: string | null | undefined, short = false): string {
        if (!iso) return '';
        return short ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    }
}
