import { Injectable, Pipe, PipeTransform, computed, signal } from '@angular/core';
import { createClient, Session } from '@supabase/supabase-js';
import { env } from '../env';
import type { TxDraft } from './tx-form';
import { guessIcon } from './icon';
import { bankOf } from './banks';

export const sb = createClient(env.supabaseUrl, env.supabaseKey);

export interface Account { id: string; name: string; kind: string; color: string | null; archived: boolean; balance: number; forecast: number; institution: string | null }
export interface Card {
  id: string; name: string; limit_cents: number; closing_day: number; due_day: number; color: string | null;
  archived: boolean; last4: string | null; payment_account_id: string | null; available: number;
  current_invoice_date: string; current_invoice_due: number; institution: string | null; network: string | null;
}
export interface Category { id: string; name: string; kind: 'expense' | 'income'; color: string; parent_id: string | null; archived: boolean; icon: string | null }
export const catIcon = (c?: Pick<Category, 'icon' | 'name'> | null) => c?.icon || (c ? guessIcon(c.name) : 'category');
export interface Tx {
  id: string; description: string; amount: number; date: string; paid: boolean;
  account_id: string | null; card_id: string | null; invoice_date: string | null; pays_card_id: string | null;
  category_id: string | null; transfer_id: string | null; group_id: string | null;
  installment: number | null; installments: number | null; recurring: boolean; tags: string[]; notes: string | null; source: string;
  reviewed: boolean;
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
export const monthLabel = (iso: string, short = false) =>
  new Date(iso.slice(0, 7) + '-15T12:00:00').toLocaleDateString('pt-BR', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
export const toCents = (v: number | string) => Math.round(Number(String(v).replace(',', '.')) * 100);
export const brl = (cents: number, compact = false) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) });

/** Cor salva, ou a do banco (escolhido ou pelo nome) — contas/cartões importados vêm sem cor. */
export const bankColor = (name: string, color?: string | null, institution?: string | null) => color || bankOf(name, institution)?.color || null;

/** Tema: '' segue o sistema; 'light'/'dark' fixam. Gráficos escutam o evento 'grana-theme'. */
export type Theme = '' | 'light' | 'dark';
export const theme = signal<Theme>((localStorage.getItem('grana.theme') as Theme) || '');
export function setTheme(t: Theme) {
  theme.set(t);
  localStorage.setItem('grana.theme', t);
  document.documentElement.dataset['theme'] = t;
  dispatchEvent(new Event('grana-theme'));
}

/** Vencimento da fatura em que cai uma compra (mesma regra do banco: invoice_due). */
export function invoiceDue(date: string, closing: number, due: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  let cy = y, cm = m;
  if (d > Math.min(closing, last(y, m))) { cm++; if (cm > 12) { cm = 1; cy++; } }
  let dy = cy, dm = cm;
  if (due <= closing) { dm++; if (dm > 12) { dm = 1; dy++; } }
  return `${dy}-${String(dm).padStart(2, '0')}-${String(Math.min(due, last(dy, dm))).padStart(2, '0')}`;
}

/** Ocultar valores (olho): lido pelo pipe brl. */
export const hidden = signal(localStorage.getItem('grana.hidden') === '1');
export function toggleHidden() {
  hidden.update((h) => !h);
  localStorage.setItem('grana.hidden', hidden() ? '1' : '0');
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

/** Avisos com ação opcional (ex.: Desfazer). Um por vez, some sozinho. */
export interface Toast { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => unknown } }
export const toast = signal<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(text: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}) {
  clearTimeout(toastTimer);
  toast.set({ id: Date.now(), text, tone: opts.tone ?? 'ok', action: opts.action });
  toastTimer = setTimeout(() => toast.set(null), opts.action ? 6000 : 3500);
}

/** Mensagens do Supabase Auth em português. */
export function authError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.';
  if (/signups? not allowed|signup is disabled/i.test(msg)) return 'Cadastros estão fechados no momento.';
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'Este e-mail já tem conta. Use Entrar ou Esqueci minha senha.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (/password should be at least|weak/i.test(msg)) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
  if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
  return msg;
}

/** Lança erro do supabase como exceção e avisa (evita esquecer de checar `error`). */
export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) { notify(error.message, { tone: 'error' }); throw new Error(error.message); }
  return data as NonNullable<T>; // update/delete sem select devolvem null; quem chama não usa o retorno
}

/** Estado compartilhado: sessão, cadastros e o formulário de lançamento (aberto de qualquer tela). */
@Injectable({ providedIn: 'root' })
export class Store {
  session = signal<Session | null>(null);
  ready = signal(false);
  accounts = signal<Account[]>([]);
  cards = signal<Card[]>([]);
  categories = signal<Category[]>([]);
  pending = signal(0);
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

  /** Alteração com "Desfazer": guarda as linhas antes, aplica, oferece restaurar. */
  async withUndo(text: string, ids: { column: 'id' | 'transfer_id' | 'group_id'; value: string | string[]; fromDate?: string },
                 apply: () => PromiseLike<unknown>) {
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
