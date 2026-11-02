// Contas e assinaturas recorrentes detectadas pelo histórico (como Copilot/Rocket Money). Sem dependências: testável no Node.
export interface RecTx { id: string; description: string; amount: number; date: string; category_id: string | null }
export interface Recurring {
  key: string; name: string; amount: number; stable: boolean; months: number;
  last: RecTx; next: string; category_id: string | null;
}

/** "Imposto de renda 6/8" e "IMPOSTO DE RENDA  7/8" viram a mesma chave */
export const normDesc = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*\d+\s*\/\s*\d+\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const pad = (n: number) => String(n).padStart(2, '0');

/** `rows`: despesas (amount < 0) dos últimos ~6 meses; `today`: 'YYYY-MM-DD'. */
export function detectRecurring(rows: RecTx[], today: string): Recurring[] {
  const ym = (d: string) => d.slice(0, 7);
  const back = (n: number) => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
  const recent = new Set([back(0), back(1), back(2)]);
  const groups = new Map<string, RecTx[]>();
  for (const r of rows) {
    const k = normDesc(r.description);
    if (k.length >= 3 && r.amount < 0) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Recurring[] = [];
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => ym(t.date)));
    // ≥ 3 meses diferentes, ainda ativa (2 dos últimos 3 meses) e no máx. ~1 por mês (mercado/uber não são conta fixa)
    if (months.size < 3 || [...months].filter((m) => recent.has(m)).length < 2 || txs.length > months.size * 1.5) continue;
    const vals = txs.map((t) => -t.amount), amount = median(vals);
    if (Math.max(...vals) - Math.min(...vals) > amount * 0.6) continue; // valor muito solto (Uber, iFood): é hábito, não conta
    const last = txs.reduce((a, b) => (b.date > a.date ? b : a));
    const day = median(txs.map((t) => +t.date.slice(8, 10)));
    // próxima: neste mês se ainda não caiu, senão no próximo
    const base = months.has(back(0)) ? new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)) : new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, 1));
    const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    out.push({
      key, name: last.description.trim(), amount, months: months.size, last, category_id: last.category_id,
      stable: (Math.max(...vals) - Math.min(...vals)) <= amount * 0.1,
      next: `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
