import { Injectable, computed, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import type { TxDraft } from '../features/transactions/tx-form';
import { Account, Card, Category, Tx, byPosition } from './models';
import { must, sb } from './supabase';
import { ask, notify } from './ui-state';
import { clearCache } from './cache';

/** Estado compartilhado: sessão, cadastros e o formulário de lançamento (aberto de qualquer tela). */
@Injectable({ providedIn: 'root' })
export class Store {
    session = signal<Session | null>(null);
    ready = signal(false);
    accounts = signal<Account[]>([]);
    cards = signal<Card[]>([]);
    categories = signal<Category[]>([]);
    pending = signal(0);
    /** lançamentos automáticos esperando conferência (página Para revisar) */
    toReview = signal(0);
    version = signal(0); // incrementa a cada alteração; páginas recarregam com effect()
    form = signal<{ draft: TxDraft; done?: (id: string | null) => void } | null>(null);
    /** chegou pelo link de "esqueci minha senha": pedir senha nova */
    recovery = signal(false);

    catById = computed(() => new Map(this.categories().map((c) => [c.id, c])));
    originName = computed(() => {
        const m = new Map<string, string>();
        this.accounts().forEach((a) => m.set(a.id, a.name));
        this.cards().forEach((c) => m.set(c.id, c.name));
        return m;
    });
    firstName = computed(() => (this.session()?.user.user_metadata?.['full_name'] ?? '').split(' ')[0]);
    avatar = computed(() => this.session()?.user.user_metadata?.['avatar_url'] as string | undefined);

    constructor() {
        sb.auth.getSession().then(({ data }) => this.setSession(data.session));
        sb.auth.onAuthStateChange((e, s) => {
            if (e === 'PASSWORD_RECOVERY') this.recovery.set(true);
            this.setSession(s);
        });
    }

    open(draft: TxDraft, done?: (id: string | null) => void) {
        this.form.set({ draft, done });
    }

    private async setSession(s: Session | null) {
        const changed = s?.user.id !== this.session()?.user.id;
        this.session.set(s);
        if (changed) clearCache();
        if (s && changed) await this.load();
        this.ready.set(true);
    }

    async load() {
        clearCache(); // algo mudou: as telas buscam de novo sem mostrar o resultado guardado (velho)
        const [a, c, k, n, r] = await Promise.all([
            sb.from('account_balances').select('*').order('name'),
            sb.from('card_status').select('*').order('name'),
            sb.from('categories').select('*').order('name'),
            sb.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            sb.from('transactions').select('id', { count: 'exact', head: true }).eq('reviewed', false),
        ]);
        this.accounts.set(((a.data ?? []) as Account[]).sort(byPosition));
        this.cards.set(((c.data ?? []) as Card[]).sort(byPosition));
        this.categories.set(((k.data ?? []) as Category[]).sort(byPosition));
        this.pending.set(n.count ?? 0);
        this.toReview.set(r.count ?? 0);
        this.version.update((v) => v + 1);
    }

    /** Trocou a categoria? Oferece aplicar aos outros com a mesma descrição. Vira "regra" de graça: o lançamento
     *  automático (notificação/Open Finance) já usa a última categoria daquela descrição. */
    async offerSameDesc(t: { id: string; description: string }, category_id: string | null) {
        const cat = this.catById().get(category_id ?? '');
        if (!cat || !t.description.trim()) return;
        const desc = t.description.trim();
        // prefixo + comparação sem espaços nas pontas (o import do Organizze traz "Bilhete " com espaço)
        let q = sb
            .from('transactions')
            .select('id, description')
            .ilike('description', desc.replace(/[%_\\]/g, '\\$&') + '%')
            .neq('id', t.id)
            .or(`category_id.is.null,category_id.neq.${cat.id}`)
            .is('transfer_id', null)
            .is('pays_card_id', null);
        q = cat.kind === 'income' ? q.gt('amount', 0) : q.lt('amount', 0);
        const ids = ((await q).data ?? [])
            .filter((r) => r.description.trim().toLowerCase() === desc.toLowerCase())
            .map((r) => r.id as string);
        if (!ids.length) return;
        notify(`Aplicar ${cat.name} a ${ids.length === 1 ? 'outro' : `outros ${ids.length}`} "${desc}"?`, {
            action: {
                label: 'Aplicar',
                run: () =>
                    this.withUndo(`${ids.length} em ${cat.name}`, { column: 'id', value: ids }, () =>
                        must(sb.from('transactions').update({ category_id: cat.id, reviewed: true }).in('id', ids)),
                    ),
            },
        });
    }

    /** Apaga do Storage os anexos que nenhum lançamento usa mais (as parcelas dividem o mesmo arquivo). */
    async dropUnusedFiles(paths: string[]) {
        if (!paths.length) return;
        const { data, error } = await sb.from('transactions').select('attachments').overlaps('attachments', paths);
        if (error) return;
        const used = new Set(data.flatMap((r) => r.attachments as string[]));
        const gone = paths.filter((p) => !used.has(p));
        if (gone.length) await sb.storage.from('anexos').remove(gone);
    }

    /** Para revisar (Início e página própria): troca a categoria e oferece aplicar aos outros com a mesma descrição. */
    async setCat(t: { id: string; description: string }, category_id: string) {
        await must(
            sb
                .from('transactions')
                .update({ category_id: category_id || null })
                .eq('id', t.id),
        );
        void this.offerSameDesc(t, category_id);
    }

    /** Para revisar: aprova, com Desfazer. */
    approve(t: { id: string; description: string }) {
        return this.withUndo(`${t.description} aprovado`, { column: 'id', value: t.id }, () =>
            must(sb.from('transactions').update({ reviewed: true }).eq('id', t.id)),
        );
    }

    /** Excluir com Desfazer. Fixo/parcelado pergunta o alcance, como no Organizze: só este, este e os próximos, ou todos.
     *  false = cancelou (a exclusão segue em segundo plano, a tela pode fechar na hora). */
    async removeTx(t: Partial<Tx>): Promise<boolean> {
        if (!t.id) return false;
        const series = !t.transfer_id && (t.group_id || t.installments || t.recurring);
        const scope = !series
            ? 'one'
            : await ask(
                  `Excluir “${t.description?.trim()}”?`,
                  [
                      { value: 'one', label: 'Só este', icon: 'event' },
                      { value: 'next', label: 'Este e os próximos', icon: 'arrow_forward' },
                      { value: 'all', label: t.installments ? 'Todas as parcelas' : 'Todos os meses', icon: 'delete_sweep', danger: true },
                  ],
                  t.installments ? `Parcela ${t.installment} de ${t.installments}` : 'Lançamento fixo, repete todo mês',
              );
        if (!scope) return false;
        let target: { column: 'id' | 'transfer_id'; value: string | string[] } = t.transfer_id
            ? { column: 'transfer_id', value: t.transfer_id }
            : { column: 'id', value: t.id };
        if (scope !== 'one') {
            // a série: pelo group_id; importados do Organizze não têm, então mesma descrição + conta/cartão + parcelas (ou fixo)
            let q = sb.from('transactions').select('id');
            q = t.group_id
                ? q.eq('group_id', t.group_id)
                : (t.installments ? q.eq('installments', t.installments) : q.eq('recurring', true))
                      .eq('description', t.description!)
                      .eq(t.card_id ? 'card_id' : 'account_id', (t.card_id ?? t.account_id)!);
            if (scope === 'next') q = q.gte('date', t.date!);
            target = { column: 'id', value: (await must(q)).map((r) => r.id as string) };
        }
        void this.withUndo(scope === 'one' ? 'Lançamento excluído' : 'Lançamentos excluídos', target, () =>
            must(
                Array.isArray(target.value)
                    ? sb.from('transactions').delete().in('id', target.value)
                    : sb.from('transactions').delete().eq(target.column, target.value),
            ),
        );
        return true;
    }

    /** Alteração com "Desfazer": guarda as linhas antes, aplica, oferece restaurar. */
    async withUndo(
        text: string,
        ids: { column: 'id' | 'transfer_id' | 'group_id'; value: string | string[]; fromDate?: string },
        apply: () => PromiseLike<unknown>,
    ) {
        let q = sb.from('transactions').select('*');
        q = Array.isArray(ids.value) ? q.in(ids.column, ids.value) : q.eq(ids.column, ids.value);
        if (ids.fromDate) q = q.gte('date', ids.fromDate);
        const before = await must(q);
        await apply();
        await this.load();
        // anexos de lançamento excluído saem do Storage depois do Desfazer (desfez: voltam a ser usados e ficam)
        // shortcut: fechar o app nesses 10 s deixa o arquivo órfão; limpar no servidor (cron) se isso pesar no 1 GB
        const files = before.flatMap((r) => (r.attachments ?? []) as string[]);
        if (files.length) setTimeout(() => void this.dropUnusedFiles(files), 10_000);
        notify(text, {
            action: {
                label: 'Desfazer',
                run: async () => {
                    await must(sb.from('transactions').upsert(before));
                    await this.load();
                    notify('Desfeito');
                },
            },
        });
    }
}
