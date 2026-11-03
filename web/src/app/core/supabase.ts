import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';
import { env } from '../../env';
import { notify } from './ui-state';

// processLock: trava só dentro da aba. O padrão (navigator.locks) é compartilhado entre abas e trava o app quando uma aba
// antiga do grana fica congelada em segundo plano no Chrome/TWA segurando o lock (getSession() nunca responde).
export const sb = createClient(env.supabaseUrl, env.supabaseKey, { auth: { lock: processLock } });

/** Lança erro do supabase como exceção e avisa (evita esquecer de checar `error`). */
export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
    const { data, error } = await p;
    if (error) {
        notify(error.message, { tone: 'error' });
        throw new Error(error.message);
    }
    return data as NonNullable<T>; // update/delete sem select devolvem null; quem chama não usa o retorno
}

/** Todas as linhas, em páginas de 1000: a API corta cada resposta em max_rows (1000) sem avisar.
 *  `page` monta a consulta de novo a cada página, com ordem estável (ex.: termina em id). */
export async function allRows<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; ; i += 1000) {
        const rows = await must(page(i, i + 999));
        out.push(...rows);
        if (rows.length < 1000) return out;
    }
}
