# Plano — PASSOS 2, 3, 10, 11, 12

## Achados antes de aplicar (decisão da Mariana necessária)

1. **`profiles` não existe e o arquivo `202606a_profiles_admin.sql` também não.** A migration M6 (linha 5) declara como pré-requisito `public.profiles(user_id, role)` mas o repo nunca criou. Vou gerar a migration faltante.
2. **A migration M6 não tem nenhum `GRANT`.** Sem GRANT, PostgREST devolve permission denied — ela vai aplicar mas o app fica cego. Vou adicionar um patch de GRANTs no mesmo lote.
3. **Roles em `profiles.role` violam a regra do projeto** (roles devem viver em `user_roles` com `has_role()`). Toda a base de código M6 (`is_admin()` SQL, `_shared/supabase.ts`, `useIsAdmin`) lê `profiles.role`. Vou manter `profiles.role` por compatibilidade nesta rodada para destravar M6, e registrar como dívida para refatorar depois. Se preferir refatorar agora, me avise e replanejo (atinge 1 SQL + 1 helper edge + 1 hook frontend).
4. **`AURORA_APP_URL`**: o app não tem custom domain. URL pública do Cloudflare Worker do Lovable = `https://demeo-finance-hub.lovable.app` (production) ou `https://project--0bbab5d0-6726-45bd-92b2-f096965588c7.lovable.app` (URL estável). Vou usar a publicada `https://demeo-finance-hub.lovable.app`. Confirmar.

## Execução

### PASSO 2 — Migrations

1. **Nova migration `202606a_profiles_admin.sql`** (criada antes da M6 rodar, mas como M6 já está no disco e ainda não rodou, vou aplicá-las em ordem cronológica de timestamp):
   - `public.profiles(user_id uuid PK ref auth.users, role text default 'user', display_name, created_at, updated_at)`
   - trigger updated_at
   - GRANT SELECT, INSERT, UPDATE on profiles to authenticated; GRANT ALL to service_role
   - RLS: cada user lê/edita o próprio profile; service_role bypassa
   - trigger `on_auth_user_created` → insere profile automático
2. **Aplicar `202606_modulo6_aurora.sql`** (já no disco).
3. **Nova migration `202606b_m6_grants.sql`** com GRANTs nas 11 tabelas M6 + 2 views:
   - `lead_sources, deal_stages, services`: SELECT a `anon, authenticated` (catálogo público p/ landing)
   - `leads, deals, deal_stage_history, deal_activities, proposals, proposal_items, contracts, service_price_history, document_counters`: SELECT/INSERT/UPDATE/DELETE a `authenticated`; ALL a `service_role`
   - `proposals, proposal_items`: SELECT a `anon` (RLS já filtra por `x-proposal-token`)
   - views: SELECT a `authenticated` + `service_role`
4. **Aplicar `202606_rate_limit_hits.sql`**.

### PASSO 3 — Storage

- `supabase--storage_create_bucket(name="proposals", public=false)`
- `supabase--storage_create_bucket(name="contracts", public=false)`
- (Policies de objects ficam para quando `proposal-generate` realmente fizer upload; M6 não tem ainda PDF gerado.)

### PASSO 10 — Secrets

- `AURORA_APP_URL = https://demeo-finance-hub.lovable.app` (via secrets--add_secret).
- `RESEND_API_KEY`, `AURORA_NOTIFY_FROM`, `AURORA_NOTIFY_TO`, `TURNSTILE_SECRET`: **NÃO setar** (aguardando Mariana).

### PASSO 11 — Deploy edge functions

- `supabase--deploy_edge_functions(["lead-intake","deal-move","proposal-generate","proposal-accept","proposal-view","pipeline-kpis"])`.
- **Nota**: Lovable Cloud não tem flag `--no-verify-jwt` por função no fluxo via tool. As funções já têm `_shared/cors.ts` + checagem manual de bearer (`userFromAuthHeader`). `lead-intake` precisa ser pública → vou adicionar `verify_jwt = false` em `supabase/config.toml` para `lead-intake` (única exceção permitida pelas regras), e deixar as outras no default.

### PASSO 12 — Validação (resultado bruto colado no PR)

1. `supabase--read_query`: `select tablename from pg_tables where schemaname='public' order by 1;` → esperar 13 (12 M6 + profiles + rate_limit_hits + document_counters... contando: document_counters, lead_sources, deal_stages, services, service_price_history, leads, deals, deal_stage_history, deal_activities, proposals, proposal_items, contracts = 12 M6 + profiles + rate_limit_hits = **14**). Vou reportar o número real e a lista.
2. `select (select count(*) from lead_sources) ls, (select count(*) from deal_stages) ds, (select count(*) from services) s;` → esperar 6, 6, 4.
3. `supabase--curl_edge_functions(path="/lead-intake", method=POST, body={"name":"QA","phone":"19999999999","consent_lgpd":true,"source_slug":"landing-page"})` → esperar 201 com `lead_id` e `deal_id`.
4. `select count(*) from leads;` e `select s.slug, count(*) from deals d join deal_stages s on s.id=d.stage_id group by s.slug;` → esperar 1, 1 em `lead`.
5. Confirmar `v_pipeline_kpis` e `v_service_pricing_monthly` existem: `select table_name from information_schema.views where table_schema='public';`
6. Confirmar RLS: `select tablename, rowsecurity from pg_tables where schemaname='public';`

Resultado bruto de cada passo será colado no final da execução.

## Bloqueios possíveis

- Migration M6 falhar se algum ENUM/extension não existir (não vi nenhuma exigência exótica; usa `gen_random_bytes` que precisa de `pgcrypto` — vou adicionar `CREATE EXTENSION IF NOT EXISTS pgcrypto` no patch de profiles para garantir).
- `lead-intake` retornar 401 se o `verify_jwt=false` não pegar antes do primeiro request — testarei e ajustarei se necessário.

Confirma para eu seguir? (Especificamente: (a) manter `profiles.role` por ora, (b) usar `https://demeo-finance-hub.lovable.app` como `AURORA_APP_URL`.)
