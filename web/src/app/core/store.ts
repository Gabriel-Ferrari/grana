import { Injectable, computed, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import type { TxDraft } from '../features/transactions/tx-form';
import { Account, Card, Category, byPosition } from './models';
import { must, sb } from './supabase';
import { notify } from './ui-state';
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
    /** banco já tem a migração 20261102080000 (anexos, essenciais, balanço…)? Até lá, essas partes ficam escondidas. */
    /** migração 20261102090000 (ordem manual) já está no banco? */
    v3 = computed(() => this.accounts().some((a) => a.position !== undefined));
    v2 = computed(() => this.categories().some((c) => c.essential !== undefined));
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
