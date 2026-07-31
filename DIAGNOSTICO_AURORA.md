# Diagnóstico Completo — Sistema Aurora
**Data:** 16/06/2026 · **Responsável:** Claude Cowork (IAplicada)

---

## 1. ESTRUTURA DO PROJETO

### Organização de pastas

```
demeo-finance-hub/
├── src/
│   ├── components/          shadcn/ui + componentes Aurora
│   │   └── landing/         ~30 componentes da landing page
│   ├── hooks/               use-mobile, useCategories, useClickOutside, useReveal
│   ├── integrations/supabase/ client.ts, types.ts, auth-middleware.ts
│   ├── lib/                 auth.ts, mockData.ts, supabase.ts, utils.ts, query.ts
│   ├── routes/              21 rotas (ver seção 3)
│   └── styles.css
├── supabase/
│   ├── functions/           10 Edge Functions
│   └── migrations/          16 migrations
├── docs/                    Documentos reais do cliente (Clínica Naitzke)
├── public/brand/            Assets visuais Aurora
└── *.md                     3 planos de execução (M01, M02, plano geral)
```

### Stack e dependências

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | TanStack Start (React 19 + TanStack Router) | ^1.167 |
| Build | Vite 7 + Cloudflare Plugin | ^7.3 |
| UI | shadcn/ui + Radix UI + Tailwind v4 | – |
| Estado | TanStack Query v5 | ^5.83 |
| Banco | Supabase JS | ^2.108 |
| Drag & Drop | @dnd-kit/core | ^6.3 |
| Gráficos | Recharts | ^2.15 |
| IA | @anthropic-ai/sdk (nas Edge Functions) | via npm: |
| Testes | Jest + Playwright | configurados |

**Deployment:** Cloudflare Pages (`wrangler.jsonc` presente). Projeto gerado via Lovable (`@lovable.dev/vite-tanstack-config`).

### Configurações de ambiente

```env
# Frontend (.env — prefixo VITE_)
VITE_SUPABASE_URL=https://ofvhmiugqkpzlgziqnjb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...           (anon key)
VITE_AURORA_APP_URL=https://auroragfe.com

# Edge Functions (secrets no Supabase/Lovable — não expor no front)
SUPABASE_URL=https://ofvhmiugqkpzlgziqnjb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
N8N_WEBHOOK_URL=https://iaplicada.app.n8n.cloud/webhook/aurora-extrato
```

**Integração n8n (extratos):** a notificação pós-upload é disparada pela Edge Function `create-upload` via secret `N8N_WEBHOOK_URL` (URL de **webhook** de produção, não URL de editor `/workflow/`). O front-end em `admin.importar.tsx` **não** chama n8n — há comentário explícito para não duplicar a chamada. Outros fluxos usam webhooks dedicados nas respectivas Edge Functions (ex.: `contract-send`, `create-client-user`).

---

## 2. BANCO DE DADOS

### Tabelas (16 migrations aplicadas — schema completo)

| Tabela | Descrição |
|--------|-----------|
| `clients` | Clientes PJ da Claudia |
| `client_banks` | Bancos por cliente |
| `uploads` | Extratos enviados |
| `transactions` | Lançamentos individuais |
| `classification_rules` | Regras de aprendizado por cliente |
| `categories` | Plano de contas por cliente |
| `profiles` | Perfis de usuário (auth) |
| `user_roles` | Roles (admin / client) |
| `leads` | Captação da landing |
| `deals` | Pipeline CRM |
| `deal_stages` | Etapas do kanban |
| `deal_stage_history` | Histórico de movimentação |
| `deal_activities` | Notas/tarefas por deal |
| `proposals` | Propostas comerciais |
| `proposal_items` | Itens da proposta |
| `contracts` | Contratos |
| `services` | Catálogo de serviços |
| `service_price_history` | Histórico de precificação |
| `document_counters` | Numeração automática |
| `lead_sources` | Origens de lead |
| `rate_limit_hits` | Rate-limiting das Edge Functions |

### Views

| View | Uso |
|------|-----|
| `recurrence_patterns` | Camada 2 do classify-batch (padrões aprovados ≥2x em 90 dias) |
| `accuracy_report` | Acurácia da classificação automática por cliente/mês |
| `v_pipeline_kpis` | KPIs do pipeline CRM |
| `v_service_pricing_monthly` | Histórico de preços por mês |

### Funções SQL

`is_admin()`, `current_client_id()`, `next_proposal_number()`, `next_contract_number()`, `normalize_description()`, `build_pattern()` + triggers de auditoria, seed de categorias, mudança de stage, snapshot de preço.

### RLS

✅ RLS ativada em todas as tabelas. Padrão: admin acessa tudo via `user_roles`. Portal lê apenas transações `approved` do próprio `client_id`. Proposta pública lida via `x-proposal-token` no header.

### Problema crítico de schema

❌ **`clients` não tem coluna `segment`** — a Edge Function `classify-batch` (linha 144) faz:
```ts
const { data: client } = await supabase.from("clients").select("name, segment")...
```
A coluna não existe. O Supabase retorna `segment: undefined` silenciosamente. O prompt do Claude Haiku fica com `Setor: Empresa` para todos os clientes, degradando a qualidade da classificação IA sem gerar erro visível.

### Problema de schema em `profiles`

❌ `tg_handle_new_user()` (migration `202606b_user_roles.sql`) insere `email` e `full_name` em `profiles`, mas o `types.ts` gerado mostra que `profiles` só tem `display_name` (não `full_name` nem `email`). Se o trigger existir no banco com essa assinatura, todo novo cadastro falhará silenciosamente ou quebrará.

### Migrations pendentes / suspeitas

A migration `202606b_user_roles.sql` referencia `202606a_profiles_admin.sql` no comentário, mas esse arquivo **não existe no repositório**. Se não foi aplicada ao banco, o trigger `tg_handle_new_user` pode não existir.

---

## 3. FUNCIONALIDADES — ROTAS

### Admin (Claudia)

| Rota | Arquivo | Status |
|------|---------|--------|
| `/admin/` | `admin.index.tsx` | ✅ Funcional — dados reais do Supabase, KPIs, gráfico de receita por cliente |
| `/admin/importar` | `admin.importar.tsx` | ✅ Funcional — upload de extrato, pipeline parse→classify, lançamento manual |
| `/admin/pendentes` | `admin.pendentes.tsx` | ✅ Funcional — classificação manual, salva regras, aprova transações |
| `/admin/dfc` | `admin.dfc.tsx` | ✅ Funcional — DFC real por cliente/período, projeção 90 dias |
| `/admin/pipeline` | `admin.pipeline.tsx` | ✅ Funcional — Kanban drag & drop, histórico de stage, modal de perda |
| `/admin/regras` | `admin.regras.tsx` | ✅ Funcional — lista e gerencia regras de classificação |
| `/admin/insights/precificacao` | `admin.insights.precificacao.tsx` | ✅ Funcional — histórico real de preços, win-rate por faixa |
| `/admin/clientes` | `admin.clientes.tsx` | 🔍 Não inspecionado |
| `/admin/clientes/$clientId` | `admin.clientes.$clientId.tsx` | 🔍 Não inspecionado |
| `/admin/propostas` | `admin.propostas.tsx` | 🔍 Não inspecionado |
| `/admin/propostas/nova` | `admin.propostas.nova.tsx` | 🔍 Não inspecionado |
| `/admin/contratos` | `admin.contratos.tsx` | 🔍 Não inspecionado |
| `/admin/contratos/novo` | `admin.contratos.novo.tsx` | 🔍 Não inspecionado |
| `/admin/servicos` | `admin.servicos.tsx` | 🔍 Não inspecionado |
| `/admin/categorias` | `admin.categorias.tsx` | 🔍 Não inspecionado |
| `/admin/relatorios` | `admin.relatorios.tsx` | ⚠️ **Incompleta** — lista clientes mas botões PDF/Excel são `<span>` sem funcionalidade |

### Portal e público

| Rota | Arquivo | Status |
|------|---------|--------|
| `/portal` | `portal.tsx` | ⚠️ **Incompleto** — UI funcional, mas "Baixar PDF" e "Falar com Claudia" são botões sem ação; requer `user_metadata.client_id` que não há UI para configurar |
| `/login` | `login.tsx` | 🔍 Não inspecionado |
| `/p/proposta/$token` | `p.proposta.$token.tsx` | 🔍 Não inspecionado |
| `/` | `index.tsx` | 🔍 Não inspecionado (landing page — componentes todos existem) |

### Edge Functions

| Função | Status |
|--------|--------|
| `parse-extract` | ✅ Implementada — CSV/XLSX nativos + IA para PDF/imagem |
| `classify-batch` | ✅ Implementada — 3 camadas (regras → recorrência → Claude Haiku) — **bug no contador** |
| `create-upload` | 🔍 Não inspecionado |
| `deal-move` | 🔍 Não inspecionado |
| `lead-intake` | 🔍 Não inspecionado |
| `pipeline-kpis` | 🔍 Não inspecionado |
| `proposal-accept` | 🔍 Não inspecionado |
| `proposal-generate` | 🔍 Não inspecionado |
| `proposal-view` | 🔍 Não inspecionado |
| `status` | 🔍 Não inspecionado |

---

## 4. ANÁLISE INTELIGENTE DE IA — "Cérebro Cláudia"

### O que já existe de IA real

**Camada 1 — Regras determinísticas** (`classify-batch`)
Motor de pattern matching por cliente. Padrão mais longo vence (specificity wins). Cada aprovação manual pode virar regra (via `/admin/pendentes`). Bem implementado.

**Camada 2 — Recorrência automática** (`recurrence_patterns` view)
Transações aprovadas ≥2x em 90 dias viram sugestão sem custo de API. Elegante e eficiente.

**Camada 3 — Claude Haiku** (`classify-batch`)
Classifica o que as camadas 1 e 2 não resolveram. Usa as categorias do banco (não hardcoded) + nome do cliente + padrões recorrentes como contexto. Threshold: conf ≥70 → approved, <70 → pending.

**Parse de extratos não-estruturados** (`parse-extract`)
Claude Haiku com visão lê PDFs e imagens de extratos bancários. Diferencial real — a maioria dos sistemas aceita só CSV.

**`accuracy_report` view**
Mede a % de transações classificadas automaticamente por cliente/mês com faixas de confiança (≥85 / ≥70 / manual). **Está no banco mas não aparece em nenhuma tela.**

### Avaliação: a IA agrega valor real?

**Sim, nas camadas 1–3 do motor de classificação.** A arquitetura é sólida: regras determinísticas → recorrência semântica → IA como fallback. Isso resolve o problema central (classificar sem travar o fechamento).

**Não ainda nos insights.** A IA existente é operacional (classificação) mas não estratégica (análise). O cliente recebe números, não diagnóstico.

### Comparação com Yampa

O Yampa entrega diagnóstico automático a partir de fluxo de caixa e extrato. O Aurora tem os dados brutos para ir além, mas ainda não os transforma em inteligência estratégica.

| Capacidade | Yampa | Aurora hoje | Aurora potencial |
|-----------|-------|-------------|-----------------|
| Classificação automática | ✅ | ✅ | ✅ |
| Diagnóstico automático de fluxo | ✅ | ❌ | 🎯 |
| Detecção de anomalias | ✅ | ❌ | 🎯 |
| Alertas de tendência | ✅ | ❌ | 🎯 |
| Análise multi-cliente (visão gestora) | ❌ | ❌ | 🎯 Exclusivo |
| Contexto do setor no prompt | ✅ | ❌ (bug) | 🎯 |
| Aprendizado contínuo | Desconhecido | ✅ | ✅ |
| Leitura de PDF/imagem | Desconhecido | ✅ | ✅ |
| Portal do cliente nativo | ❌ | ✅ | ✅ |
| Pipeline CRM integrado | ❌ | ✅ | ✅ |

### Dados subutilizados (oportunidades para o Cérebro)

1. **`accuracy_report`** — mede % automático por cliente/mês. Poderia mostrar quais clientes têm mais ruído e precisam de atenção.
2. **`recurrence_patterns`** — padrões frequentes já mapeados. Base perfeita para "alerta de gasto recorrente novo".
3. **`transactions` com `confidence`** — sabe quais lançamentos a IA classificou com baixa confiança. Claudia poderia priorizar revisão pelos mais incertos.
4. **`deal_stage_history`** — tempo médio em cada etapa. Base para diagnóstico de onde os deals travam.
5. **`service_price_history`** — já tem win-rate por faixa. Com mais dados, poderia recomendar preço ótimo por segmento de cliente.
6. **Padrão de `pendentes` por cliente ao longo do tempo** — se um cliente acumula mais pendentes mês a mês, é sinal de que precisa de regras novas.

### Arquitetura recomendada para o Cérebro Cláudia

Um módulo único (`/admin/cerebro` + Edge Function `cerebro-insights`) que:
- Roda ao final de cada fechamento (trigger no upload.status = 'done')
- Lê: transações aprovadas do mês + histórico de 3 meses + recurrence_patterns
- Gera com Claude Sonnet (não Haiku — aqui vale a qualidade): narrativa do mês, anomalias, comparativo histórico, 3 alertas prioritários
- Armazena em tabela `client_insights` (client_id, month, json payload, created_at)
- Exibe no portal do cliente e no painel admin

**Custo estimado:** ~R$ 0,08–0,15 por fechamento com Sonnet. Para 4 clientes/mês = R$ 0,60 total. Margem excelente.

**Diferencial vs Yampa:** Yampa analisa qualquer empresa. O Cérebro Cláudia será treinado no contexto específico de cada cliente (histórico, setor, padrões, contratos) — inteligência contextual acumulada, não genérica.

**Riscos:**
- Latência: Sonnet leva 5–15s. Solução: processamento assíncrono (webhook no n8n, não síncrono na UI).
- Custo de API com escala: com 30 clientes = ~R$ 4,50/mês — desprezível.
- Dependência da Anthropic: rate limits podem afetar fechamentos simultâneos. Solução: fila n8n com retry.

---

## 5. INTEGRAÇÕES

### Supabase
✅ Conectado. Realtime ativo em `uploads` e `transactions` (para polling de status na UI).

### n8n
⚠️ **Configuração inconsistente:**
- `.env` tem `VITE_N8N_WEBHOOK_URL=https://mariaiaplicada.app.n8n.cloud/workflow/TwPUbUe1PTYPrpPP`
- `admin.importar.tsx` hardcoda `https://mariaiaplicada.app.n8n.cloud/webhook/aurora-extrato`
- `n8n_aurora_pipeline.json` existe no projeto mas não inspecionado
- O webhook de notificação falha silenciosamente (`.catch(() => {})`) — correto para não bloquear o fluxo, mas Claudia pode não receber notificações de upload

### Claude / Anthropic
✅ Integrado via `npm:@anthropic-ai/sdk` nas Edge Functions. Modelo: `claude-haiku-4-5-20251001`. A ANTHROPIC_API_KEY deve estar nas variáveis de ambiente do Supabase (não exposta no `.env` do projeto — correto).

### Cloudflare
⚠️ `wrangler.jsonc` presente. Deploy configurado para Cloudflare Pages/Workers, mas não inspecionado em detalhes.

### Credenciais faltantes
- `ANTHROPIC_API_KEY` — deve estar nas env vars do Supabase (não verificável via código)
- `SUPABASE_SERVICE_ROLE_KEY` — usada nas Edge Functions, deve estar nas secrets do Supabase
- Storage bucket `extratos` — a migration diz "criar manualmente no painel Supabase"
- Storage buckets `proposals` e `contracts` — mesma situação

---

## 6. PROBLEMAS ENCONTRADOS

### 🔴 Bloqueantes

**B1 — Bug no contador `tx_classified` (`classify-batch`, linha 283)**
```ts
if (status === "classified") aiClassified++;  // NUNCA ocorre
```
`status` só pode ser `"approved"` ou `"pending"`. O valor `aiClassified` é sempre 0. O campo `uploads.tx_classified` fica zerado para toda classificação por IA. Afeta o dashboard de acompanhamento de uploads.

**B2 — `clients` sem coluna `segment`**
`classify-batch` busca `client?.segment` mas a coluna não existe. O Claude Haiku classifica sem contexto de setor, reduzindo acurácia. Solução: adicionar migration com `ALTER TABLE clients ADD COLUMN segment TEXT`.

**B3 — Schema mismatch em `profiles`**
`tg_handle_new_user` insere `(user_id, email, full_name)` mas `profiles` pode não ter `email` e `full_name`. Qualquer novo cadastro pode quebrar silenciosamente. Verificar o schema real do banco no Supabase Dashboard.

**B4 — Portal sem UI para vincular client_id ao usuário**
O portal lê `session?.user?.user_metadata?.client_id` mas não há tela no admin para vincular um usuário de portal a um cliente. Um empresário não consegue acessar seu portal sem configuração manual no Supabase Dashboard.

### 🟡 Importantes (não bloqueam mas limitam)

**I1 — Dois padrões de Supabase client no frontend**
- `admin.importar.tsx`, `admin.pendentes.tsx`, `portal.tsx`, `admin.pipeline.tsx`: importam de `@/lib/supabase` e usam `supabase()` (função)
- `admin.index.tsx`, `admin.dfc.tsx`, `admin.regras.tsx`, `admin.relatorios.tsx`: importam de `@/integrations/supabase/client` e usam `supabase.from()` (objeto direto)
Risco: comportamento diferente em sessão/autenticação dependendo da tela.

**I2 — `admin.relatorios.tsx` — PDF/Excel sem implementação**
Botões são `<span className="aurora-link">` — nenhuma ação. Funcionalidade prometida mas não entregue.

**I3 — Portal: "Baixar PDF" e "Falar com Claudia" sem implementação**
Dois botões críticos para a UX do cliente são no-ops.

**I4 — `n8n_aurora_pipeline.json` vs webhook hardcoded**
Webhook em `admin.importar.tsx` aponta para `/webhook/aurora-extrato` mas a env var aponta para outro endpoint. Se o n8n workflow não tem a rota `/webhook/aurora-extrato`, notificações de upload nunca chegam.

**I5 — `mockData.ts` é código morto**
O arquivo `src/lib/mockData.ts` contém 4 clientes e ~50 transações fictícias (Padaria São Jorge, etc). Não é mais consumido por nenhuma tela funcional. Pode ser excluído ou mantido como fixture de testes.

**I6 — `accuracy_report` view não exibida em lugar algum**
Dados valiosos de qualidade da IA existem no banco mas nenhuma tela os mostra. Claudia não sabe se a IA está melhorando ou piorando por cliente.

### 🟢 Melhorias (não urgentes)

**M1 — Projeção DFC é simplista**
`admin.dfc.tsx` projeta aplicando fator fixo (+3%/mês receita, +2%/mês despesa) sobre o mês selecionado. Não usa dados históricos reais. Para ser "baseada em recorrências" como diz a UI, deveria ler transações `is_recurring = true` dos últimos 3 meses.

**M2 — `admin.importar.tsx` importa múltiplos arquivos mas processa só o primeiro**
`handleUpload` recebe `fileList: File[]` e itera para preview, mas chama `const file = fileList[0]` para processar. Múltiplos arquivos selecionados = apenas o primeiro é enviado, sem feedback ao usuário.

**M3 — `admin.pendentes.tsx` salva regra com pattern ingênuo**
```ts
const pattern = tx.description.split(" ").slice(0, 3).join(" ").toUpperCase();
```
Não usa `build_pattern()` (que remove datas e números), então padrões gerados manualmente terão qualidade menor que os gerados automaticamente.

**M4 — Não há limpeza automática de `rate_limit_hits`**
A migration inclui comentário `-- DELETE FROM ... WHERE hit_at < now() - interval '24 hours'` mas não configura `pg_cron`. Essa tabela vai crescer indefinidamente.

---

## 7. PENDÊNCIAS PRIORIZADAS

### 🔴 Bloqueantes — corrigir antes de usar em produção

| # | Pendência | Esforço |
|---|-----------|---------|
| 1 | Corrigir bug `aiClassified` em `classify-batch/index.ts` linha 283 | 5 min |
| 2 | Adicionar coluna `segment` em `clients` (migration) | 15 min |
| 3 | Verificar/corrigir schema de `profiles` no Supabase Dashboard | 30 min |
| 4 | Criar UI admin para vincular portal user → client_id | 2–3h |
| 5 | Verificar se buckets `extratos`, `proposals`, `contracts` estão criados no Storage | 15 min |
| 6 | Verificar se `migration 202606a_profiles_admin.sql` foi aplicada ao banco | 15 min |

### 🟡 Importantes — completar no Sprint 2

| # | Pendência | Esforço |
|---|-----------|---------|
| 7 | Unificar padrão de Supabase client (escolher um e padronizar) | 2h |
| 8 | Corrigir webhook n8n (usar env var, verificar endpoint correto) | 30 min |
| 9 | Implementar download PDF/Excel em `/admin/relatorios` | 4–6h |
| 10 | Corrigir projeção DFC para usar `is_recurring = true` real | 2h |
| 11 | Corrigir `admin.importar.tsx` para processar múltiplos arquivos | 1h |
| 12 | Usar `build_pattern()` em `admin.pendentes.tsx` ao salvar regra | 30 min |

### 🟢 Estratégicas — Sprint 3–4

| # | Pendência | Esforço |
|---|-----------|---------|
| 13 | Exibir `accuracy_report` no painel admin | 3h |
| 14 | Implementar "Baixar PDF" e "Falar com Claudia" no portal | 4h |
| 15 | Configurar pg_cron para limpeza de `rate_limit_hits` | 30 min |
| 16 | Remover `mockData.ts` (código morto) | 5 min |

---

## 8. OPORTUNIDADES DE DIFERENCIAÇÃO VIA IA (vs Yampa)

Em ordem de impacto e viabilidade técnica:

### 🥇 Narrativa mensal automática por cliente ("Resumo Aurora")
Ao final do fechamento, gerar em linguagem natural: "Em maio, a Clínica Naitzke teve receita 12% acima de abril, puxada pelo aumento de convênios. O aluguel seguiu estável. Atenção: gastos com manutenção subiram 40% — pode ser pontual ou indicar necessidade de revisão de contratos."

**Por que o Yampa não faz igual:** ele gera diagnóstico genérico. O Aurora tem o histórico acumulado, o setor, e as categorias personalizadas — a narrativa pode ser contextual e personalizada.

**Implementação:** Edge Function `cerebro-insights` chamada via n8n quando upload.status = 'done'. Armazena em `client_insights`. Exibe no portal e no admin. ~3 dias de desenvolvimento.

### 🥈 Alerta de anomalia ("Algo diferente esse mês")
Detectar automaticamente: nova despesa recorrente que não existia antes, gasto numa categoria que cresceu >30% vs média histórica, receita que caiu abaixo do piso dos últimos 3 meses.

**Base de dados disponível:** `recurrence_patterns` + histórico de `transactions`. Não precisa de IA — pode ser SQL puro com alertas gerados por queries, e IA apenas para narrativizar o alerta.

### 🥉 Painel de saúde da carteira (visão exclusiva da Claudia)
Um dashboard que mostra, para todos os clientes, o "índice de saúde" calculado de: % de lançamentos classificados automaticamente, evolução de receita mês a mês, variação de margem. Yampa não tem isso — eles são focados no portal do empresário, não na visão da gestora.

**Dado disponível:** `accuracy_report` + transactions.

### 🏅 Sugestão de nova regra proativa
Quando a IA classifica 3+ transações com o mesmo padrão com confiança ≥85, sugerir proativamente: "Percebi que PIX FORNECEDOR X foi classificado 4x como Despesa Variável · Insumos. Deseja criar uma regra automática?" — elimina o trabalho manual de Claudia.

**Implementação:** trigger ou cron job que verifica `transactions` agrupadas por `build_pattern()` e enfileira sugestões.

---

*Diagnóstico realizado por inspeção direta de código-fonte, migrations e arquitetura. Não foram executados testes nem verificados logs de runtime. Os itens marcados como "🔍 Não inspecionado" correspondem a rotas e funções que não apresentaram risco óbvio na análise estrutural.*
