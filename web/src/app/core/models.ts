import { guessIcon } from '../shared/ui/icon';

export interface Account {
    id: string;
    name: string;
    kind: string;
    color: string | null;
    archived: boolean;
    balance: number;
    forecast: number;
    institution: string | null;
    hide_from_total: boolean;
    /** ordem manual (Ajustes) */
    position: number;
}
export interface Card {
    id: string;
    name: string;
    limit_cents: number;
    closing_day: number;
    due_day: number;
    color: string | null;
    archived: boolean;
    last4: string | null;
    payment_account_id: string | null;
    available: number;
    current_invoice_date: string;
    current_invoice_due: number;
    institution: string | null;
    network: string | null;
    position: number;
}
export interface Category {
    id: string;
    name: string;
    kind: 'expense' | 'income';
    color: string;
    parent_id: string | null;
    archived: boolean;
    icon: string | null;
    essential: boolean;
    position: number;
}
/** ordem manual (position) e depois nome — igual em todo o app */
export const byPosition = <T extends { position?: number; name: string }>(a: T, b: T) =>
    (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'pt-BR');
export const catIcon = (c?: Pick<Category, 'icon' | 'name'> | null) => c?.icon || (c ? guessIcon(c.name) : 'category');
export interface Tx {
    id: string;
    description: string;
    amount: number;
    date: string;
    paid: boolean;
    account_id: string | null;
    card_id: string | null;
    invoice_date: string | null;
    pays_card_id: string | null;
    category_id: string | null;
    transfer_id: string | null;
    group_id: string | null;
    installment: number | null;
    installments: number | null;
    recurring: boolean;
    tags: string[];
    notes: string | null;
    source: string;
    attachments: string[];
    reviewed: boolean;
}
export interface Invoice {
    card_id: string;
    invoice_date: string;
    total: number;
    paid: number;
    items: number;
    is_paid: boolean;
}
