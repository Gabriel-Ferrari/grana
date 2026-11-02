import { Injectable, Pipe, PipeTransform, computed, signal } from '@angular/core';
import { createClient, Session } from '@supabase/supabase-js';
import { env } from '../env';

export const sb = createClient(env.supabaseUrl, env.supabaseKey);

export interface Account { id: string; name: string; kind: string; color: string | null; archived: boolean; balance: number; forecast: number }
export interface Card {
  id: string; name: string; limit_cents: number; closing_day: number; due_day: number; color: string | null;
  archived: boolean; last4: string | null; payment_account_id: string | null; available: number; current_invoice_date: string; current_invoice_due: number;
}
export interface Category { id: string; name: string; kind: 'expense' | 'income'; color: string; parent_id: string | null; archived: boolean }
export interface Tx {
  id: string; description: string; amount: number; date: string; paid: boolean;
  account_id: string | null; card_id: string | null; invoice_date: string | null; pays_card_id: string | null;
  category_id: string | null; transfer_id: string | null; group_id: string | null;
  installment: number | null; installments: number | null; recurring: boolean; tags: string[]; notes: string | null; source: string;
}
export interface Invoice { card_id: string; invoice_date: string; total: number; paid: number; items: number; is_paid: boolean }

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
export const monthLabel = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
export const toCents = (v: number | string) => Math.round(Number(String(v).replace(',', '.')) * 100);

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    return ((cents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}

@Pipe({ name: 'dmy' })
export class DmyPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  }
}

/** Estado compartilhado: sessão + cadastros (contas, cartões, categorias). Lançamentos são buscados por página. */
@Injectable({ providedIn: 'root' })
export class Store {
  session = signal<Session | null>(null);
  ready = signal(false);
  accounts = signal<Account[]>([]);
  cards = signal<Card[]>([]);
  categories = signal<Category[]>([]);
  pending = signal(0);
  version = signal(0); // incrementa a cada alteração; páginas recarregam com effect()

  catById = computed(() => new Map(this.categories().map((c) => [c.id, c])));
  originName = computed(() => {
    const m = new Map<string, string>();
    this.accounts().forEach((a) => m.set(a.id, a.name));
    this.cards().forEach((c) => m.set(c.id, c.name));
    return m;
  });

  constructor() {
    sb.auth.getSession().then(({ data }) => this.setSession(data.session));
    sb.auth.onAuthStateChange((_e, s) => this.setSession(s));
  }

  private async setSession(s: Session | null) {
    const changed = s?.user.id !== this.session()?.user.id;
    this.session.set(s);
    if (s && changed) await this.load();
    this.ready.set(true);
  }

  async load() {
    const [a, c, k, n] = await Promise.all([
      sb.from('account_balances').select('*').order('name'),
      sb.from('card_status').select('*').order('name'),
      sb.from('categories').select('*').order('name'),
      sb.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    this.accounts.set((a.data ?? []) as Account[]);
    this.cards.set((c.data ?? []) as Card[]);
    this.categories.set((k.data ?? []) as Category[]);
    this.pending.set(n.count ?? 0);
    this.version.update((v) => v + 1);
  }
}

export const toast = signal('');

/** Lança erro do supabase como exceção e mostra aviso (evita esquecer de checar `error`). */
export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) { toast.set(error.message); throw new Error(error.message); }
  return data as NonNullable<T>; // update/delete sem select devolvem null; quem chama não usa o retorno
}
