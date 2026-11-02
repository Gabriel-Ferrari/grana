# Engenharia reversa do Organizze (02/11/2026)

Fontes: MCP do Organizze (dados da conta), web app `app.organizze.com.br` (Chrome), APK Android
`com.organizze.android` v7.4.41 puxado do Galaxy S23 via REA (`pull_adb_package`, evidence
`ev_c64dc6ecc193…`), `aapt2` (manifest) e `dexdump` (bytecode; o JADX não estava configurado no REA).

## Arquitetura observada
| Peça | Observado |
|---|---|
| Web | Angular (templates `zze-front/…`), API interna `/zze_front/*` + `app2…/api/rails/v1/*` (Rails) |
| Android | **Flutter** (`libapp.so` AOT, evidence `ev_0c67bb58…`) + Kotlin nativo para o listener; ofuscado com R8 + PairIP (VM do Google Play) |
| API pública | `api.organizze.com.br/rest/v2`, Basic auth (email + token), `User-Agent` obrigatório |
| Open Finance | **Belvo** (agregador pago) — tabelas `bank_connection*` no SQLite do app |
| Analytics/push | CleverTap, Firebase, PostHog |

## Modelo de dados (SQLite do app + API v2)
- `accounts` (kind, balance, institution_id, automatic, hide_balance)
- `credit_cards` (billing_cycle_day = fechamento, billing_due_day = vencimento, limit_in_cents, payment_account_id)
- `categories` (kind, parent_id, color, group_id, essential, fixed)
- transações: `amount_cents`, `paid`, `account_id` **ou** `credit_card_id` + `credit_card_invoice_id`,
  `installment/total_installments`, `recurring`, transferência = par ligado por `oposite_transaction_id`,
  pagamento de fatura = lançamento na conta com `paid_credit_card_id` + `paid_credit_card_invoice_id`
- `budgets` (category_id, date, amount_in_cents), `tags` + `transactions_tags`
- **`notification_raw`** (description, date, amount, notification_tag, sync) ← fila de notificações capturadas

Regra de fatura confirmada nos seus dados: compra **no dia do fechamento** entra na fatura que fecha
nesse dia (Bradesco fecha 23: compra 23/10 → vence 05/11; 24/10 → 05/12).
"Fatura atual" na home = próxima não paga com vencimento ≥ hoje.

## Captura de notificações (o que o Organizze faz)
Serviço `com.organizze.android.receivers.NLService` (NotificationListenerService):
1. Lê extras `android.title`, `title.big`, `text`, `bigText`, `subText`, `infoText`, `textLines`.
2. Ignora WhatsApp, Telegram, Gmail; trata "conteúdo sensível oculto".
3. Normaliza: remove acentos e CNPJ (`\b\d{2}\.?\d{3}\.?\d{3}/\d{4}(-|\.)\d{2}`), moedas (`R¤`, ` RS `).
4. Descarta notificação re-entregue (rebind do listener) e deduplica por (tag, descrição, valor).
5. Parser com estratégias `package_exact` → `package_contains` → `text_prefix` → `genericParse`,
   catálogo (classe ofuscada `zv2`) com ~100 instituições: prefixo do texto + package + slug.
   Ex.: `"BRADESCO CARTOES"`/`br.com.bradesco.cartoes`, `"Sicoobcard informa:"`/`tivit.com.cabal.sicoob.cp`,
   `"CAIXA"`/`br.com.gabba.Caixa`, `"nubank:"`/`com.nu.production`;
   regex como `recebeu\s+um\s+pix\s+de\s+r\$\s*[\d.,]+\s+de\s+(.+?)(?:,|\s+cpf|\s+no\s+valor)`.
6. `NotificationListenerRecoveryWorker`: religa o listener quando o Android/Samsung o derruba.
7. Resultado vira `ImportData` → `notification_raw` → tela "NotificationRawScreen" para o usuário importar.

O Grana reimplementa a mesma ideia (código próprio): coletor Kotlin mínimo envia o texto cru,
parser roda no servidor (atualiza sem reinstalar), texto cru fica salvo para reprocessar.

## Pacotes de banco no seu celular
`com.bradesco`, `br.com.bradesco.cartoes`, `com.nu.production`, `br.com.sicoobnet`,
`tivit.com.cabal.sicoob.cp` (Sicoob Cartões), `br.com.gabba.Caixa`.

## Limites desta análise
- Sem JADX: lógica Kotlin lida por `dexdump` (bytecode), Dart só por strings do AOT — regex exatas por banco não extraídas.
- Nenhuma notificação bancária real estava na bandeja no momento; textos de teste do parser são plausíveis, não reais.
