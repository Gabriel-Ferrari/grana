# grana

Controle financeiro pessoal no estilo Organizze, com infraestrutura **gratuita**, login Google e
lançamentos automáticos a partir das **notificações dos bancos** no Android.

```
Android (grana coletor) ──POST texto cru──▶ Supabase Edge Function `ingest` ──▶ Postgres (RLS)
                                               parser + conta/cartão + categoria        ▲
Angular (Cloudflare Workers) ── supabase-js + login Google ─────────────────────────────────┘
```

| Pasta | O quê |
|---|---|
| `supabase/migrations` | schema, regras de fatura, views de saldo/fatura/relatório, RLS, categorias padrão |
| `supabase/functions/ingest` | recebe notificações, parser (`parser.ts`) |
| `web/` | app Angular: visão geral, lançamentos, cartões/faturas, relatórios, limites, notificações, ajustes |
| `android/` | app Android "grana": app web em tela cheia (TWA/Chrome) + coletor de notificações (Kotlin) |
| `scripts/import-organizze.mjs` | migra seus dados do Organizze (API v2), idempotente |
| `docs/engenharia-reversa.md` | o que foi descoberto sobre o Organizze |

## Desenvolvimento local
```bash
npx supabase start -x studio,imgproxy,vector,logflare,realtime,storage-api,postgres-meta,supavisor,mailpit
npx supabase functions serve            # outro terminal
cd web && npm i && npx ng serve          # http://localhost:4200 (login dev por e-mail/senha)
```
Testes: `node --test supabase/functions/ingest/parser.test.ts supabase/functions/pluggy/map.test.ts web/src/app/*.spec.ts` e
`docker exec -i supabase_db_grana psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/check.sql`.

Usuário dev local: crie com
`curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H 'content-type: application/json' -d '{"email":"dev@grana.local","password":"devdev123","email_confirm":true}'`
(`SERVICE_ROLE` = `npx supabase status -o env | grep SERVICE_ROLE_KEY`).

Celular contra o Supabase local: `adb reverse tcp:54321 tcp:54321` e endpoint `http://127.0.0.1:54321/functions/v1/ingest`.

## Deploy (tudo grátis)

Produção atual: Supabase `mfsblnrygzwdefvnezas`, Google Cloud `grana-513513`, Cloudflare Worker `grana`.

### 1. Supabase
1. Crie um projeto em supabase.com (região São Paulo).
2. `npx supabase login && npx supabase link --project-ref SEU_REF`
3. `npx supabase db push` e `npx supabase functions deploy ingest --no-verify-jwt`

### 2. Login com Google
1. console.cloud.google.com → APIs e serviços → Tela de consentimento OAuth: Externo; adicione seu Gmail como usuário de teste
   (escopos básicos email/perfil não precisam de verificação).
2. Credenciais → Criar ID do cliente OAuth → Aplicativo da Web. URI de redirecionamento autorizado:
   `https://SEU_REF.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Sign In / Providers → Google: cole Client ID e Secret.
4. Supabase → Authentication → URL Configuration: Site URL = URL do Cloudflare Pages (passo 3).
5. **Depois do seu primeiro login**, desligue "Allow new users to sign up" (Authentication → Sign In / Providers).
   Assim só você entra; o RLS já isola os dados por usuário de qualquer forma.

### 3. Frontend (Cloudflare Workers, assets estáticos — grátis)
1. `web/src/env.prod.ts` tem Project URL + publishable key (públicas; RLS protege os dados).
2. `cd web && npm run deploy` (build + `wrangler deploy`; config em `web/wrangler.jsonc`, SPA fallback ligado).
3. No ar: https://grana.ferrari-gabriel2002.workers.dev — Site URL e Redirect URL (`…/**`) já cadastrados no Supabase.

### 4. Celular
Um APK só (`dev.grana.coletor`): o ícone **grana** abre o app web em tela cheia (Trusted Web Activity no Chrome;
o login Google funciona, em WebView não) e o mesmo app roda o coletor de notificações em segundo plano.
A tela do coletor não tem ícone: **toque longo em grana → Configurar coletor**, ou pelo link `grana://setup`.

1. Build: `cd android && ./gradlew assembleDebug` → `android/build/outputs/apk/debug/grana-coletor-debug.apk`.
2. Instalar: `adb install -r android/build/outputs/apk/debug/grana-coletor-debug.apk`, ou copie o APK para o celular e
   abra (permita *Instalar apps desconhecidos* para o app de arquivos). Use sempre a mesma chave
   (`~/.android/debug.keystore`): assim o `-r` mantém dados e acesso às notificações, e a digital continua batendo com
   `web/public/.well-known/assetlinks.json` (é o que tira a barra de URL; trocou de chave → gere o SHA-256 com
   `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` e atualize o arquivo).
3. Configurar o coletor: no app web, **Notificações → Gerar token** e toque no link `grana://setup?endpoint=…&token=…`.
   O coletor abre com endpoint e token **preenchidos, mas nada salvo**: confira o endpoint
   (`https://SEU_REF.supabase.co/functions/v1/ingest`) e toque em **Confirmar configuração**, depois **Enviar teste**.
   Qualquer página pode disparar esse link, por isso ele nunca salva sozinho. Sem o link: cole endpoint e token na tela
   e toque em Salvar. (Via `adb shell am start -n dev.grana.coletor/.MainActivity --es endpoint … --es token …` só
   funciona com o app sem token; para trocar use a tela ou `adb shell pm clear dev.grana.coletor`.)
4. Samsung: *Configurações → Notificações → Configurações avançadas → Acesso às notificações do dispositivo* → ative
   **grana · coletor**. *Aplicativos → grana → Bateria → Não restringir*; em *Bateria → Limites de uso em segundo plano*
   coloque em **"Aplicativos que nunca entram em suspensão"**.
5. Em **Ajustes** do app web, preencha em cada conta/cartão o **app que notifica** e o **final do cartão**.
   Com isso as notificações viram lançamentos automáticos; o que não casar fica em **Notificações** para revisar.
   Quando um banco mandar um formato que o parser não entende, copie o texto para `parser.test.ts` e ajuste `parser.ts`.

### 5. Migrar do Organizze
Token em app.organizze.com.br/configuracoes/api-keys, depois:
```bash
ORGANIZZE_EMAIL=... ORGANIZZE_TOKEN=... SUPABASE_URL=https://SEU_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... GRANA_EMAIL=seu@gmail.com node scripts/import-organizze.mjs 2018-01
```

## Cuidados do plano grátis
- Supabase pausa o projeto após **7 dias sem atividade** — o coletor enviando notificações mantém ativo.
- Plano grátis não tem backup automático: rode `npx supabase db dump --data-only > backup.sql` de vez em quando.
- Relatórios buscam linhas cruas (limite padrão de 1000 por consulta no Supabase) — se um período tiver mais que isso,
  troque por uma função SQL agregada.

## Opções de banco gratuito avaliadas
| Opção | Grátis | Prós | Contras |
|---|---|---|---|
| **Supabase** (escolhido) | Postgres 500 MB, Auth, 500 mil funções/mês | Login Google, RLS e API REST prontos: zero backend de CRUD | pausa após 7 dias parado; sem backup no free |
| Cloudflare D1 + Workers | 5 GB, 5 mi leituras/dia | nunca pausa, você já usa wrangler | SQLite; login Google e API CRUD escritos à mão |
| Neon | Postgres 0,5 GB | scale-to-zero, branches | só banco (sem auth/API) |
| Turso | SQLite ~5 GB | rápido na edge | só banco |
| Firebase | Firestore 1 GB + Auth | login Google trivial | NoSQL ruim p/ relatórios; Functions exigem plano Blaze (cartão) |
| MongoDB Atlas M0 | 512 MB | — | só banco, NoSQL |

## Conexão com bancos (Open Finance)
Direto com o banco não dá (só instituições autorizadas pelo Banco Central). Via **Pluggy/MeuPluggy** dá, grátis para
uso pessoal: veja o passo a passo em [`docs/pluggy.md`](docs/pluggy.md). No app: *Ajustes → Bancos conectados*.
