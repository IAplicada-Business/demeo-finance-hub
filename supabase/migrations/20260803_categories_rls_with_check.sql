-- categories: FOR ALL sem WITH CHECK pode bloquear INSERT em alguns caminhos RLS.
BEGIN;

DROP POLICY IF EXISTS "admin_all_categories" ON public.categories;
CREATE POLICY "admin_all_categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
