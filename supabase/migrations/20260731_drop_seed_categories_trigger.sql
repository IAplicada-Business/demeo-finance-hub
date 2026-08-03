-- Fase 2: novos clientes não recebem mais as 16 categorias padrão Aurora.
-- O plano de contas do cliente passa a ser a única fonte de categorias.

BEGIN;

DROP TRIGGER IF EXISTS seed_categories_on_new_client ON public.clients;
DROP FUNCTION IF EXISTS public.tg_seed_categories_for_new_client();

COMMIT;
