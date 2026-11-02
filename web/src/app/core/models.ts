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
}
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
