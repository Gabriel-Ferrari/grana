// Open Finance fora da tela de Ajustes (abertura do app, formulário): sem o componente, para não pesar o carregamento inicial.
import { signal } from '@angular/core';
import { notify, sb } from '../../core';

/** Sincroniza com a Pluggy (função no Supabase). Usado pelo painel e ao abrir o app. */
export async function pluggySync(): Promise<{ inserted: number; merged: number; errors: string[] } | null> {
    const { data, error } = await sb.functions.invoke('pluggy', { body: { action: 'sync' } });
    if (error) {
        notify('Falha ao sincronizar com o banco', { tone: 'error' });
        return null;
    }
    return data;
}

/** bancos conectados (null = ainda não sei); quem preenche: abertura do app e esta tela */
export const bankCount = signal<number | null>(null);
/** pedido para abrir o guia de conexão (vem do convite em outra tela) */
export const ofGuide = signal(false);
/** Convite para conectar o banco no momento certo (salvou lançamento à mão, criou conta), como o dos avisos:
 *  só sem banco conectado e no máximo a cada 14 dias. `go` leva até Ajustes > Bancos. true = mostrou o convite. */
export function offerBank(text: string, go: () => unknown): boolean {
    if (bankCount() !== 0) return false;
    if (Date.now() - Number(localStorage.getItem('grana.bank.ask') ?? 0) < 14 * 864e5) return false;
    localStorage.setItem('grana.bank.ask', String(Date.now()));
    notify(text, {
        action: {
            label: 'Conectar',
            run: () => {
                ofGuide.set(true);
                return go();
            },
        },
    });
    return true;
}
