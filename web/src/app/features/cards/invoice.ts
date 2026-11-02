// Situação da fatura: "fecha em 3 dias", "fechada · vence em 5 dias", "vencida há 2 dias". Sem dependências (testável no Node).
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const days = (a: string, b: string) => Math.round((utc(a) - utc(b)) / 864e5);

/** Dia de fechamento da fatura que vence em `due` (mesma regra de invoiceDue: vencimento ≤ fechamento cai no mês seguinte). */
export function invoiceClosing(due: string, closing: number, dueDay: number): string {
    let y = +due.slice(0, 4),
        m = +due.slice(5, 7);
    if (dueDay <= closing) {
        m--;
        if (m < 1) {
            m = 12;
            y--;
        }
    }
    return `${y}-${pad(m)}-${pad(Math.min(closing, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
}

export function invoiceStatus(
    due: string,
    closing: number,
    dueDay: number,
    today: string,
): { text: string; tone: 'open' | 'closed' | 'late' } {
    const tc = days(invoiceClosing(due, closing, dueDay), today),
        td = days(due, today);
    if (tc > 1) return { text: `fecha em ${tc} dias`, tone: 'open' };
    if (tc >= 0) return { text: tc ? 'fecha amanhã' : 'fecha hoje', tone: 'open' };
    if (td > 1) return { text: `fechada · vence em ${td} dias`, tone: 'closed' };
    if (td >= 0) return { text: td ? 'vence amanhã' : 'vence hoje', tone: 'closed' };
    return { text: `vencida há ${-td} ${td === -1 ? 'dia' : 'dias'}`, tone: 'late' };
}
