/**
 * Último resultado de cada consulta, em memória (stale-while-revalidate): ao voltar para uma tela ela aparece
 * na hora com o que já tinha e se atualiza quando a rede responde. Limpo ao trocar de usuário.
 */
const memo = new Map<string, unknown>();

/** Aplica o resultado guardado (se houver), busca de novo e aplica o novo. Devolve se havia algo guardado. */
export async function swr<T>(key: string, load: () => Promise<T>, apply: (v: T) => void): Promise<boolean> {
    const hit = memo.has(key);
    if (hit) apply(memo.get(key) as T);
    const fresh = await load();
    memo.set(key, fresh);
    apply(fresh);
    return hit;
}
export const cached = (key: string) => memo.has(key);
export function clearCache() {
    memo.clear();
}
