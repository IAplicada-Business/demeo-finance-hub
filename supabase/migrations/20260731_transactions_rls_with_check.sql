-- Garante WITH CHECK explícito nas policies admin de transactions e uploads.
-- Sem WITH CHECK, alguns updates (status → approved) podem ser silenciosamente bloqueados.

BEGIN;

DROP POLICY IF EXISTS "admin_all_transactions" ON public.transactions;
CREATE POLICY "admin_all_transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_uploads" ON public.uploads;
CREATE POLICY "admin_all_uploads" ON public.uploads
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
