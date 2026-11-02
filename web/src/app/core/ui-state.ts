import { signal } from '@angular/core';

/** Tema: '' segue o sistema; 'light'/'dark' fixam. Gráficos escutam o evento 'grana-theme'. */
export type Theme = '' | 'light' | 'dark';
export const theme = signal<Theme>((localStorage.getItem('grana.theme') as Theme) || '');
export function setTheme(t: Theme) {
    theme.set(t);
    localStorage.setItem('grana.theme', t);
    document.documentElement.dataset['theme'] = t;
    barColor(t);
    dispatchEvent(new Event('grana-theme'));
}
/** barra de status (theme-color): tema fixado vale para os dois media; "Sistema" volta cada um à sua cor */
function barColor(t: Theme) {
    for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name=theme-color]')) {
        const dark = m.media.includes('dark');
        m.content = (t ? t === 'dark' : dark) ? '#0a110e' : '#f7f7f0';
    }
}
barColor(theme());

/** Ocultar valores (olho): lido pelo pipe brl. */
export const hidden = signal(localStorage.getItem('grana.hidden') === '1');
export function toggleHidden() {
    hidden.update((h) => !h);
    localStorage.setItem('grana.hidden', hidden() ? '1' : '0');
}

/** Avisos com ação opcional (ex.: Desfazer). Um por vez, some sozinho. */
export interface Toast {
    id: number;
    text: string;
    tone: 'ok' | 'error';
    action?: { label: string; run: () => unknown };
}
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
    if (/already registered|already been registered|user already exists/i.test(msg))
        return 'Este e-mail já tem conta. Use Entrar ou Esqueci minha senha.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
    if (/password should be at least|weak/i.test(msg)) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
    if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
    return msg;
}

/** Sugestões de descrição no formulário (como no Organizze): até onde o histórico vale e de quais contas/cartões. */
export interface SuggestPrefs {
    /** meses de histórico (0 = tudo) */
    months: number;
    /** só da conta/cartão escolhido no formulário */
    sameOrigin: boolean;
}
export const suggestPrefs = signal<SuggestPrefs>({
    months: 12,
    sameOrigin: false,
    ...(JSON.parse(localStorage.getItem('grana.sugg') ?? '{}') as Partial<SuggestPrefs>),
});
export function setSuggestPrefs(p: SuggestPrefs) {
    suggestPrefs.set(p);
    localStorage.setItem('grana.sugg', JSON.stringify(p));
}

/** vibração curtinha ao pegar/soltar ao reordenar (como o Ionic); sem suporte, não faz nada */
export function haptic() {
    navigator.vibrate?.(8);
}

/** Botão voltar do Android (e Esc) fecha a folha aberta em vez de sair da tela — CloseWatcher do Chrome.
 *  Devolve o "soltar" para chamar quando a folha fechar por outro caminho (toque, X, salvar). */
type Watcher = { onclose: (() => void) | null; destroy(): void };
export function onBack(close: () => void): () => void {
    const W = (globalThis as { CloseWatcher?: new () => Watcher }).CloseWatcher;
    if (!W) return () => {};
    const w = new W();
    w.onclose = close;
    return () => w.destroy();
}

/** Pergunta em folha de baixo (estilo Organizze/iOS action sheet): resolve com o value escolhido, ou null se cancelou. */
export interface AskOption {
    value: string;
    label: string;
    icon?: string;
    danger?: boolean;
}
export const asking = signal<{ title: string; text?: string; options: AskOption[]; done: (v: string | null) => void } | null>(null);
export function ask(title: string, options: AskOption[], text?: string): Promise<string | null> {
    return new Promise((done) =>
        asking.set({
            title,
            text,
            options,
            done: (v) => {
                asking.set(null);
                done(v);
            },
        }),
    );
}
