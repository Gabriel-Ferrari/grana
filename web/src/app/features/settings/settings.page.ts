import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BANKS, Bank, BankLogo, CardArt, NETWORKS, bankOf, bankPackage, networkLogo, bankName, bankColor } from '../../shared/banks';
import {
    Store,
    authError,
    catIcon,
    must,
    notify,
    ask,
    sb,
    toCents,
    today,
    suggestPrefs,
    setSuggestPrefs,
    byPosition,
    haptic,
    pushState,
    enablePush,
    disablePush,
} from '../../core';
import { CATEGORY_ICONS, Icon } from '../../shared/ui/icon';
import { OpenFinance, offerBank } from '../banks/open-finance';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

type Kind = 'accounts' | 'cards' | 'categories';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas de 3 tabelas (contas, cartões, categorias) no mesmo formulário
type Row = Record<string, any>;

@Component({
    imports: [FormsModule, Icon, BankLogo, CardArt, OpenFinance, CdkDropList, CdkDrag, CdkDragHandle],
    template: `
        <div class="page-title reveal"><h1>Ajustes</h1></div>

        <div class="grid-2 reveal">
            <section class="panel">
                <div class="panel-head">
                    <h2>Contas</h2>
                    <button class="btn" (click)="create('accounts')"><g-icon name="add" [size]="18" />Conta</button>
                </div>
                <div
                    class="list reorder-list"
                    cdkDropList
                    cdkDropListLockAxis="y"
                    (cdkDropListDropped)="drop('accounts', rows().accounts, $event)"
                >
                    @for (a of rows().accounts; track a['id']; let i = $index) {
                        <div
                            cdkDrag
                            (cdkDragStarted)="haptic()"
                            (cdkDragEnded)="dragEnd()"
                            class="item click"
                            (click)="open('accounts', a)"
                            tabindex="0"
                            (keydown.enter)="open('accounts', a)"
                        >
                            <g-bank [name]="a['name']" [institution]="a['institution']" />
                            <div class="grow">
                                <div class="title">
                                    {{ a['name'] }}
                                    @if (a['archived']) {
                                        <span class="tag">arquivada</span>
                                    }
                                </div>
                                <div class="sub">
                                    @if (a['notify_package']) {
                                        <g-icon name="notifications" [size]="14" />{{ bankName(a['notify_package']) }}
                                    } @else {
                                        sem notificação ligada
                                    }
                                </div>
                            </div>
                            <span
                                class="order-btns"
                                (click)="$event.stopPropagation()"
                                (keydown.enter)="$event.stopPropagation()"
                                tabindex="-1"
                            >
                                <button
                                    class="btn ghost icon"
                                    (click)="move('accounts', rows().accounts, i, -1)"
                                    [disabled]="i === 0"
                                    aria-label="Subir"
                                    title="Subir"
                                >
                                    <g-icon name="arrow_upward" [size]="16" />
                                </button>
                                <button
                                    class="btn ghost icon"
                                    (click)="move('accounts', rows().accounts, i, 1)"
                                    [disabled]="i === rows().accounts.length - 1"
                                    aria-label="Descer"
                                    title="Descer"
                                >
                                    <g-icon name="arrow_downward" [size]="16" />
                                </button>
                            </span>
                            <g-icon name="chevron_right" class="muted" />
                            <span class="reorder-handle" cdkDragHandle aria-hidden="true" (click)="$event.stopPropagation()"
                                ><g-icon name="drag_handle" [size]="22"
                            /></span>
                        </div>
                    }
                </div>
            </section>

            <section class="panel" id="cartoes" style="scroll-margin-top:1rem">
                <div class="panel-head">
                    <h2>Cartões de crédito</h2>
                    <button class="btn" (click)="create('cards')"><g-icon name="add" [size]="18" />Cartão</button>
                </div>
                <div
                    class="list reorder-list"
                    cdkDropList
                    cdkDropListLockAxis="y"
                    (cdkDropListDropped)="drop('cards', rows().cards, $event)"
                >
                    @for (c of rows().cards; track c['id']; let i = $index) {
                        <div
                            cdkDrag
                            (cdkDragStarted)="haptic()"
                            (cdkDragEnded)="dragEnd()"
                            class="item click"
                            (click)="open('cards', c)"
                            tabindex="0"
                            (keydown.enter)="open('cards', c)"
                        >
                            <g-card-art
                                [name]="c['name']"
                                [institution]="c['institution']"
                                [color]="c['color']"
                                [last4]="c['last4']"
                                [width]="54"
                            />
                            <div class="grow">
                                <div class="title">
                                    {{ c['name'] }}
                                    @if (c['last4']) {
                                        <span class="tag">final {{ c['last4'] }}</span>
                                    }
                                    @if (c['archived']) {
                                        <span class="tag">arquivado</span>
                                    }
                                </div>
                                <div class="sub">
                                    fecha {{ c['closing_day'] }} · vence {{ c['due_day'] }} ·
                                    {{ c['notify_package'] ? bankName(c['notify_package']) : 'sem notificação' }}
                                </div>
                            </div>
                            @if (networkLogo(c['network']); as n) {
                                <img class="net-logo" [src]="n" alt="" referrerpolicy="no-referrer" />
                            }
                            <span
                                class="order-btns"
                                (click)="$event.stopPropagation()"
                                (keydown.enter)="$event.stopPropagation()"
                                tabindex="-1"
                            >
                                <button
                                    class="btn ghost icon"
                                    (click)="move('cards', rows().cards, i, -1)"
                                    [disabled]="i === 0"
                                    aria-label="Subir"
                                    title="Subir"
                                >
                                    <g-icon name="arrow_upward" [size]="16" />
                                </button>
                                <button
                                    class="btn ghost icon"
                                    (click)="move('cards', rows().cards, i, 1)"
                                    [disabled]="i === rows().cards.length - 1"
                                    aria-label="Descer"
                                    title="Descer"
                                >
                                    <g-icon name="arrow_downward" [size]="16" />
                                </button>
                            </span>
                            <g-icon name="chevron_right" class="muted" />
                            <span class="reorder-handle" cdkDragHandle aria-hidden="true" (click)="$event.stopPropagation()"
                                ><g-icon name="drag_handle" [size]="22"
                            /></span>
                        </div>
                    }
                </div>
            </section>
        </div>

        <g-openfinance class="reveal" />

        <section class="panel reveal">
            <div class="panel-head">
                <h2>Categorias</h2>
                <button class="btn" (click)="create('categories')"><g-icon name="add" [size]="18" />Categoria</button>
            </div>
            <div class="grid-2">
                @for (k of ['expense', 'income']; track k) {
                    <div>
                        <p class="muted small" style="margin:0 0 .4rem">{{ k === 'expense' ? 'Saídas' : 'Entradas' }}</p>
                        <div class="list reorder-list" cdkDropList cdkDropListLockAxis="y" (cdkDropListDropped)="dropCat(k, $event)">
                            @for (c of catsOf(k); track c['id']) {
                                <div
                                    cdkDrag
                                    (cdkDragStarted)="haptic()"
                                    (cdkDragEnded)="dragEnd()"
                                    class="item click"
                                    (click)="open('categories', c)"
                                    [style.padding-left]="c['parent_id'] ? '2rem' : null"
                                    tabindex="0"
                                    (keydown.enter)="open('categories', c)"
                                >
                                    <span class="cat-ico" [style.--cc]="c['color']"
                                        ><span class="ms">{{ icon(c) }}</span></span
                                    >
                                    <div class="grow">
                                        <div class="title">{{ c['name'] }}</div>
                                    </div>
                                    <span
                                        class="order-btns"
                                        (click)="$event.stopPropagation()"
                                        (keydown.enter)="$event.stopPropagation()"
                                        tabindex="-1"
                                    >
                                        <button
                                            class="btn ghost icon"
                                            (click)="move('categories', sibs(c), sibs(c).indexOf(c), -1)"
                                            [disabled]="sibs(c).indexOf(c) === 0"
                                            aria-label="Subir"
                                            title="Subir"
                                        >
                                            <g-icon name="arrow_upward" [size]="16" />
                                        </button>
                                        <button
                                            class="btn ghost icon"
                                            (click)="move('categories', sibs(c), sibs(c).indexOf(c), 1)"
                                            [disabled]="sibs(c).indexOf(c) === sibs(c).length - 1"
                                            aria-label="Descer"
                                            title="Descer"
                                        >
                                            <g-icon name="arrow_downward" [size]="16" />
                                        </button>
                                    </span>
                                    <g-icon name="chevron_right" class="muted" />
                                    <span class="reorder-handle" cdkDragHandle aria-hidden="true" (click)="$event.stopPropagation()"
                                        ><g-icon name="drag_handle" [size]="22"
                                    /></span>
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>
        </section>

        <section class="panel reveal">
            <div class="panel-head">
                <h2>Tags</h2>
                <span class="muted small">{{ tags().length }}</span>
            </div>
            <div class="list">
                @for (t of tags(); track t.tag) {
                    <div class="item">
                        <span class="cat-ico"><span class="ms">sell</span></span>
                        @if (tagEdit() === t.tag) {
                            <form class="row grow" (ngSubmit)="renameTag(t.tag, tagNew)" style="gap:.4rem">
                                <input name="tg" [(ngModel)]="tagNew" style="flex:1" aria-label="Novo nome da tag" />
                                <button class="btn primary">Salvar</button
                                ><button type="button" class="btn ghost" (click)="tagEdit.set('')">Cancelar</button>
                            </form>
                        } @else {
                            <div class="grow">
                                <div class="title">{{ t.tag }}</div>
                                <div class="sub">{{ t.n }} {{ t.n > 1 ? 'lançamentos' : 'lançamento' }}</div>
                            </div>
                            <button
                                class="btn ghost icon"
                                (click)="tagNew = t.tag; tagEdit.set(t.tag)"
                                aria-label="Renomear tag"
                                title="Renomear"
                            >
                                <g-icon name="edit" [size]="18" />
                            </button>
                            <button
                                class="btn ghost icon danger"
                                (click)="renameTag(t.tag, '')"
                                aria-label="Apagar tag"
                                title="Tirar de todos os lançamentos"
                            >
                                <g-icon name="delete" [size]="18" />
                            </button>
                        }
                    </div>
                } @empty {
                    <div class="empty-state">
                        <g-icon name="sell" />
                        <div>
                            <b>Nenhuma tag ainda</b>Use tags no lançamento (Mais opções) para agrupar gastos de uma viagem, obra ou projeto.
                        </div>
                    </div>
                }
            </div>
        </section>

        <section class="panel reveal">
            <div class="panel-head"><h2>Sugestões de descrição</h2></div>
            <p class="muted small" style="margin:0 0 .8rem">
                Ao digitar a descrição de um lançamento novo, o grana sugere as que você já usou (e a categoria delas).
            </p>
            <div class="row wrap end">
                <label style="min-width:200px"
                    >Histórico considerado
                    <select name="sm" [ngModel]="sugg().months" (ngModelChange)="setSugg({ months: +$event })">
                        <option [ngValue]="3">Últimos 3 meses</option>
                        <option [ngValue]="6">Últimos 6 meses</option>
                        <option [ngValue]="12">Últimos 12 meses</option>
                        <option [ngValue]="0">Todo o histórico</option>
                    </select></label
                >
                <label class="check"
                    ><input name="so" type="checkbox" [ngModel]="sugg().sameOrigin" (ngModelChange)="setSugg({ sameOrigin: $event })" /> Só
                    da conta ou cartão escolhido no lançamento</label
                >
            </div>
        </section>

        <section class="panel reveal" id="avisos">
            <div class="panel-head">
                <h2>Avisos no celular</h2>
                <g-icon name="notifications" class="muted" />
            </div>
            <p class="muted" style="margin:0 0 1rem">
                Todo dia às 8h, como no Organizze: contas a pagar e a receber do dia, fatura vencendo ou fechando amanhã, limite chegando
                perto ou estourado e, às segundas, o que ficou atrasado.
            </p>
            @switch (pushState()) {
                @case ('on') {
                    <div class="row wrap">
                        <span class="chip"><g-icon name="check_circle" [size]="16" />Ligados neste aparelho</span>
                        <button class="btn ghost" (click)="testPush()"><g-icon name="notifications" [size]="18" />Enviar teste</button>
                        <button class="btn ghost danger" (click)="disablePush()">Desligar</button>
                    </div>
                }
                @case ('blocked') {
                    <p class="neg" style="margin:0">
                        Bloqueados. Libere em Configurações do celular › Apps › grana › Notificações e abra o app de novo.
                    </p>
                }
                @case ('unsupported') {
                    <p class="muted" style="margin:0">Este navegador não manda avisos. No celular, use o app grana.</p>
                }
                @default {
                    <button class="btn primary" (click)="enablePush()"><g-icon name="notifications" [size]="18" />Ativar avisos</button>
                }
            }
        </section>

        <section class="panel reveal">
            <div class="panel-head">
                <h2>Segurança</h2>
                <g-icon name="lock" class="muted" />
            </div>
            <p class="muted" style="margin:0 0 1rem">
                Entre também com <b>{{ store.session()?.user?.email }}</b> e uma senha, além do Google.
            </p>
            <form class="row wrap end" (ngSubmit)="setPassword()">
                <label style="min-width:200px"
                    >Nova senha <input name="p1" type="password" [(ngModel)]="pass1" minlength="8" required autocomplete="new-password"
                /></label>
                <label style="min-width:200px"
                    >Repita <input name="p2" type="password" [(ngModel)]="pass2" required autocomplete="new-password"
                /></label>
                <button class="btn primary"><g-icon name="lock" [size]="18" />Definir senha</button>
            </form>
            <p class="muted small" style="margin:.8rem 0 0">Mínimo de 8 caracteres. Cada conta vê só os próprios dados.</p>
        </section>

        @if (edit(); as e) {
            <div class="scrim" (click)="edit.set(null)" (keydown.escape)="edit.set(null)" tabindex="-1"></div>
            <form class="drawer" (ngSubmit)="save(e.kind, e.row)" role="dialog" aria-modal="true">
                <header>
                    <h2>
                        {{ e.row['id'] ? 'Editar' : 'Nova' }}
                        {{ e.kind === 'accounts' ? 'conta' : e.kind === 'cards' ? 'cartão' : 'categoria' }}
                    </h2>
                    <button type="button" class="btn ghost icon" (click)="edit.set(null)" aria-label="Fechar">
                        <g-icon name="close" />
                    </button>
                </header>
                <div class="body">
                    @if (e.kind !== 'categories') {
                        <span class="field-label" id="lbl-banco">Banco</span>
                        <div class="search">
                            <g-icon name="search" /><input
                                name="bq"
                                placeholder="Buscar banco"
                                [ngModel]="bankQuery()"
                                (ngModelChange)="bankQuery.set($event)"
                                autocomplete="off"
                            />
                        </div>
                        <div class="bank-grid" role="radiogroup" aria-label="Banco">
                            @for (b of banks(); track b.id) {
                                <button
                                    type="button"
                                    role="radio"
                                    [attr.aria-checked]="isBank(e.row, b)"
                                    [class.on]="isBank(e.row, b)"
                                    (click)="pickBank(e, b)"
                                >
                                    <g-bank [institution]="b.id" [size]="34" /><span>{{ b.name }}</span>
                                </button>
                            }
                        </div>
                    }
                    <label>Nome <input name="n" [(ngModel)]="e.row['name']" required /></label>
                    @switch (e.kind) {
                        @case ('accounts') {
                            <div class="row">
                                <label
                                    >Tipo
                                    <select name="k" [(ngModel)]="e.row['kind']">
                                        <option value="checking">Corrente</option>
                                        <option value="savings">Poupança</option>
                                        <option value="investment">Investimento</option>
                                        <option value="wallet">Carteira</option>
                                        <option value="other">Outra</option>
                                    </select></label
                                >
                                <label
                                    >Saldo inicial (R$) <input name="b" type="number" step="0.01" [(ngModel)]="e.row['_initial']"
                                /></label>
                            </div>
                            @if (e.row['id']) {
                                <label
                                    >Saldo de hoje (R$) — ajuste rápido
                                    <input name="hj" type="number" step="0.01" [(ngModel)]="e.row['_today']" />
                                    <span class="muted small"
                                        >Se mudar, lança um "Ajuste de saldo" com a diferença (como no Organizze).</span
                                    ></label
                                >
                            }
                            <label class="check"
                                ><input name="hd" type="checkbox" [(ngModel)]="e.row['hide_from_total']" /> Não somar no saldo geral
                                (continua no fluxo de caixa dela)</label
                            >
                        }
                        @case ('cards') {
                            <span class="field-label" id="lbl-bandeira">Bandeira</span>
                            <div class="row wrap" role="radiogroup" aria-label="Bandeira">
                                @for (n of networks; track n.id) {
                                    <button
                                        type="button"
                                        class="chip net"
                                        role="radio"
                                        [attr.aria-checked]="e.row['network'] === n.id"
                                        [class.on]="e.row['network'] === n.id"
                                        (click)="e.row['network'] = e.row['network'] === n.id ? null : n.id"
                                    >
                                        <img [src]="networkLogo(n.id)" alt="" referrerpolicy="no-referrer" />{{ n.name }}
                                    </button>
                                }
                            </div>
                            <div class="row">
                                <label>Limite (R$) <input name="l" type="number" step="0.01" [(ngModel)]="e.row['_limit']" /></label>
                                <label
                                    >Final
                                    <input name="f" maxlength="4" inputmode="numeric" [(ngModel)]="e.row['last4']" placeholder="1234"
                                /></label>
                            </div>
                            <div class="row">
                                <label
                                    >Fecha dia <input name="c" type="number" min="1" max="31" [(ngModel)]="e.row['closing_day']" required
                                /></label>
                                <label
                                    >Vence dia <input name="v" type="number" min="1" max="31" [(ngModel)]="e.row['due_day']" required
                                /></label>
                            </div>
                            <label
                                >Pago com a conta
                                <select name="pa" [(ngModel)]="e.row['payment_account_id']">
                                    <option [ngValue]="null">—</option>
                                    @for (a of rows().accounts; track a['id']) {
                                        <option [ngValue]="a['id']">{{ a['name'] }}</option>
                                    }
                                </select></label
                            >
                        }
                        @case ('categories') {
                            <div class="row">
                                <label
                                    >Tipo
                                    <select name="k" [(ngModel)]="e.row['kind']">
                                        <option value="expense">Saída</option>
                                        <option value="income">Entrada</option>
                                    </select></label
                                >
                                <label
                                    >Subcategoria de
                                    <select name="pa" [(ngModel)]="e.row['parent_id']">
                                        <option [ngValue]="null">—</option>
                                        @for (c of catsOf(e.row['kind']); track c['id']) {
                                            @if (!c['parent_id'] && c['id'] !== e.row['id']) {
                                                <option [ngValue]="c['id']">{{ c['name'] }}</option>
                                            }
                                        }
                                    </select></label
                                >
                            </div>
                            @if (e.row['kind'] === 'expense' && !e.row['parent_id']) {
                                <label class="check"
                                    ><input name="es" type="checkbox" [(ngModel)]="e.row['essential']" /> Gasto essencial (moradia, mercado,
                                    saúde…) — usado no equilíbrio 50/30</label
                                >
                            }
                            <span class="field-label" id="lbl-icone">Ícone</span>
                            <div class="icon-grid" role="radiogroup" aria-label="Ícone">
                                @for (i of icons; track i) {
                                    <button
                                        type="button"
                                        role="radio"
                                        [attr.aria-checked]="icon(e.row) === i"
                                        [class.on]="icon(e.row) === i"
                                        (click)="e.row['icon'] = i"
                                        [title]="i"
                                    >
                                        <span class="ms">{{ i }}</span>
                                    </button>
                                }
                            </div>
                        }
                    }
                    @if (e.kind !== 'categories') {
                        <label
                            >App que notifica (lançamento automático)
                            <select name="p" [(ngModel)]="e.row['notify_package']">
                                <option [ngValue]="null">Nenhum</option>
                                @for (b of allBanks; track b.id) {
                                    @for (p of b.packages; track p) {
                                        <option [ngValue]="p">{{ b.name }} · {{ p }}</option>
                                    }
                                }
                            </select>
                        </label>
                    }
                    <div class="row end">
                        <label>Cor <input name="cor" type="color" [(ngModel)]="e.row['color']" /></label>
                        <label class="check"><input name="ar" type="checkbox" [(ngModel)]="e.row['archived']" /> Arquivado</label>
                    </div>
                    @if (e.row['id'] && e.kind !== 'categories') {
                        <p class="muted small" style="margin:0">Excluir apaga também os lançamentos. Prefira arquivar.</p>
                    }
                </div>
                <footer>
                    @if (e.row['id']) {
                        <button type="button" class="btn ghost danger" (click)="remove(e.kind, e.row)">
                            <g-icon name="delete" [size]="18" />Excluir
                        </button>
                    } @else {
                        <span></span>
                    }
                    <button class="btn primary"><g-icon name="check" [size]="18" />Salvar</button>
                </footer>
            </form>
        }
    `,
})
export class Settings {
    pushState = pushState;
    enablePush = () => enablePush();
    disablePush = disablePush;
    async testPush() {
        const { data, error } = await sb.functions.invoke('remind', { body: { test: true } });
        if (error || !data?.enviados) notify('Teste não chegou ao servidor de avisos. Desligue e ligue de novo.', { tone: 'error' });
        else notify('Teste enviado. Deve chegar em segundos.');
    }
    store = inject(Store);
    router = inject(Router);
    /** links de outras telas: ?novo=cards abre o cadastro; ?cartao=<id> abre a edição do cartão */
    novo = input<string>();
    cartao = input<string>();
    icons = CATEGORY_ICONS;
    networks = NETWORKS;
    allBanks = BANKS;
    networkLogo = networkLogo;
    bankName = bankName;
    rows = signal<Record<Kind, Row[]>>({ accounts: [], cards: [], categories: [] });
    edit = signal<{ kind: Kind; row: Row } | null>(null);
    bankQuery = signal('');
    banks = computed(() => {
        const q = this.bankQuery().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return BANKS.filter((b) => !q || b.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    });
    sugg = suggestPrefs;
    setSugg(p: Partial<{ months: number; sameOrigin: boolean }>) {
        setSuggestPrefs({ ...suggestPrefs(), ...p });
    }
    tags = signal<{ tag: string; n: number }[]>([]);
    tagEdit = signal('');
    tagNew = '';
    pass1 = '';
    pass2 = '';
    icon = (c: Row) => catIcon(c as never);

    constructor() {
        effect(() => {
            this.store.version();
            untracked(() => this.fetch());
        });
    }

    /** irmãos na ordem (mesmo tipo e mesma categoria-mãe): é entre eles que as setas trocam */
    sibs(c: Row) {
        return this.rows().categories.filter((x) => x['kind'] === c['kind'] && (x['parent_id'] ?? null) === (c['parent_id'] ?? null));
    }
    /** arrastar: tira de `from`, insere em `to` e grava a ordem */
    async drop(kind: Kind, list: Row[], e: CdkDragDrop<unknown>) {
        const l = [...list];
        moveItemInArray(l, e.previousIndex, e.currentIndex);
        haptic();
        await this.savePositions(kind, l);
    }
    haptic = haptic;
    /** arrastar categoria: muda de lugar entre as irmãs (subcategoria não troca de categoria-mãe) */
    async dropCat(kind: string, e: CdkDragDrop<unknown>) {
        if (e.previousIndex === e.currentIndex) return;
        const flat = this.catsOf(kind),
            moved = flat[e.previousIndex];
        let to = flat[e.currentIndex];
        // categoria-mãe solta sobre uma subcategoria: conta como a mãe dela
        if (!moved['parent_id'] && to['parent_id']) to = flat.find((c) => c['id'] === to['parent_id']) ?? to;
        if ((to['parent_id'] ?? null) !== (moved['parent_id'] ?? null)) return; // fora do grupo: volta ao lugar
        const l = this.sibs(moved);
        moveItemInArray(l, l.indexOf(moved), l.indexOf(to));
        haptic();
        await this.savePositions('categories', l);
    }
    /** soltar o item não deve abrir a edição dele */
    private droppedAt = 0;
    dragEnd() {
        this.droppedAt = Date.now();
    }
    private async savePositions(kind: Kind, l: Row[]) {
        await Promise.all(l.map((r, pos) => (r['position'] === pos ? null : sb.from(kind).update({ position: pos }).eq('id', r['id']))));
        await this.store.load();
    }
    /** troca de lugar com o vizinho e grava a ordem (position) de toda a lista */
    async move(kind: Kind, list: Row[], i: number, d: number) {
        const l = [...list];
        if (!l[i + d]) return;
        [l[i], l[i + d]] = [l[i + d], l[i]];
        await this.savePositions(kind, l);
    }
    catsOf(kind: string) {
        const all = this.rows().categories.filter((c) => c['kind'] === kind);
        return all.filter((c) => !c['parent_id']).flatMap((p) => [p, ...all.filter((c) => c['parent_id'] === p['id'])]);
    }

    async fetch() {
        const [a, c, k, t] = await Promise.all([
            must(sb.from('accounts').select('*').order('name')),
            must(sb.from('cards').select('*').order('name')),
            must(sb.from('categories').select('*').order('name')),
            sb.rpc('report_by_tag', { p_from: '2000-01-01', p_to: '2100-12-31' }).then((r) => r.data ?? []),
        ]);
        this.rows.set({ accounts: [...a].sort(byPosition), cards: [...c].sort(byPosition), categories: [...k].sort(byPosition) });
        const card = this.rows().cards.find((r) => r['id'] === this.cartao()),
            novo = this.novo() as Kind | undefined;
        if (card || (novo && novo in this.rows())) {
            if (card) this.open('cards', card);
            else this.create(novo!);
            // tira o pedido da URL: recarregar a lista não reabre o formulário
            void this.router.navigate([], { queryParams: { novo: null, cartao: null }, queryParamsHandling: 'merge', replaceUrl: true });
        }
        this.tags.set((t as { tag: string; n: number }[]).sort((x, y) => x.tag.localeCompare(y.tag)));
    }

    create(kind: Kind) {
        this.bankQuery.set('');
        const row: Row =
            kind === 'accounts'
                ? { kind: 'checking', _initial: 0, color: '#1f6f4a', notify_package: null }
                : kind === 'cards'
                  ? { closing_day: 1, due_day: 10, _limit: 0, color: '#1f6f4a', notify_package: null, network: null }
                  : { kind: 'expense', color: '#1f6f4a', icon: null };
        this.edit.set({ kind, row });
    }

    open(kind: Kind, r: Row) {
        if (Date.now() - this.droppedAt < 400) return;
        this.bankQuery.set('');
        const color = kind === 'categories' ? r['color'] : (bankColor(r['name'], r['color'], r['institution']) ?? '#1f6f4a');
        const today = kind === 'accounts' ? (this.store.accounts().find((a) => a.id === r['id'])?.balance ?? 0) / 100 : null;
        this.edit.set({
            kind,
            row: {
                ...r,
                color,
                _initial: (r['initial_balance'] ?? 0) / 100,
                _limit: (r['limit_cents'] ?? 0) / 100,
                _today: today,
                _todayWas: today,
            },
        });
    }

    isBank(row: Row, b: Bank) {
        return bankOf(row['name'], row['institution'])?.id === b.id;
    }

    /** Escolher o banco preenche nome, cor e app que notifica (dá pra ajustar depois). */
    pickBank(e: { kind: Kind; row: Row }, b: Bank) {
        const r = e.row;
        const prev = bankOf(r['name'], r['institution']);
        r['institution'] = b.id;
        if (!r['name'] || (prev && r['name'] === prev.name)) r['name'] = b.name;
        r['color'] = b.color;
        r['notify_package'] = bankPackage(b, e.kind === 'cards');
    }

    async save(kind: Kind, r: Row) {
        const { _initial, _limit, _today, _todayWas, created_at: _c, user_id: _u, ...row } = r;
        if (kind === 'accounts') row['initial_balance'] = toCents(_initial ?? 0);
        if (kind === 'cards') row['limit_cents'] = toCents(_limit ?? 0);
        for (const k of ['notify_package', 'last4']) if (row[k] === '') row[k] = null;
        await must(row['id'] ? sb.from(kind).update(row).eq('id', row['id']) : sb.from(kind).insert(row));
        // ajuste rápido: lança a diferença para o saldo bater com o banco
        if (kind === 'accounts' && row['id'] && _today != null && _today !== _todayWas) {
            const diff = toCents(_today) - toCents(_todayWas ?? 0);
            if (diff)
                await must(
                    sb
                        .from('transactions')
                        .insert({ account_id: row['id'], description: 'Ajuste de saldo', amount: diff, date: today(), paid: true }),
                );
        }
        this.edit.set(null);
        await this.store.load();
        // conta nova: hora boa de mostrar que os lançamentos dela podem chegar sozinhos
        const nova = kind === 'accounts' && !row['id'];
        if (!(
            nova &&
            offerBank(`Conta criada. Quer trazer os lançamentos do ${row['name']} sozinhos? Conecte pelo Open Finance.`, () =>
                document.getElementById('bancos')?.scrollIntoView({ behavior: 'smooth' }),
            )
        ))
            notify('Salvo');
    }

    async remove(kind: Kind, r: Row) {
        // conta/cartão apaga junto os lançamentos (on delete cascade); o cartão, também os pagamentos de fatura feitos na conta
        const of =
            kind === 'accounts' ? `account_id.eq.${r['id']}` : kind === 'cards' ? `card_id.eq.${r['id']},pays_card_id.eq.${r['id']}` : null;
        const c = of ? await sb.from('transactions').select('id', { count: 'exact', head: true }).or(of) : null;
        if (c?.error) return notify(c.error.message, { tone: 'error' });
        const n = c?.count ?? 0;
        const go = await ask(
            `Excluir ${r['name']}?`,
            [
                {
                    value: 'del',
                    label: n ? `Excluir e apagar ${n} lançamento${n === 1 ? '' : 's'}` : 'Excluir',
                    icon: 'delete',
                    danger: true,
                },
            ],
            n ? 'Os lançamentos não voltam. Para tirar da frente sem apagar, marque Arquivado.' : undefined,
        );
        if (!go) return;
        const files = of
            ? (await must(sb.from('transactions').select('attachments').or(of).neq('attachments', '{}'))).flatMap(
                  (t) => t.attachments as string[],
              )
            : [];
        await must(sb.from(kind).delete().eq('id', r['id']));
        void this.store.dropUnusedFiles(files);
        this.edit.set(null);
        await this.store.load();
        notify('Excluído');
    }

    /** renomeia (ou apaga, com nome vazio) a tag em todos os lançamentos */
    async renameTag(from: string, to: string) {
        const n = await must(sb.rpc('rename_tag', { p_old: from, p_new: to }));
        this.tagEdit.set('');
        await this.store.load();
        notify(to.trim() ? `"${from}" virou "${to.trim()}" em ${n} lançamentos` : `Tag "${from}" tirada de ${n} lançamentos`);
    }

    async setPassword() {
        if (this.pass1.length < 8) return notify('Use pelo menos 8 caracteres.', { tone: 'error' });
        if (this.pass1 !== this.pass2) return notify('As senhas não conferem.', { tone: 'error' });
        const { error } = await sb.auth.updateUser({ password: this.pass1 });
        if (error) return notify(authError(error.message), { tone: 'error' });
        this.pass1 = this.pass2 = '';
        notify('Senha definida. Agora você também entra com e-mail e senha.');
    }
}
