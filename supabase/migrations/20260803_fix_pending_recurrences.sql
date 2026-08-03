-- Recorrências: padrões com regra automática (trigger de aprovação, is_recurring=false)
-- sumiam da fila. Pendente = sem regra rejeitada E ainda não confirmado como recorrente.
-- Também adiciona WITH CHECK nas policies admin de classification_rules.

BEGIN;

CREATE OR REPLACE FUNCTION public.pending_recurrences(p_client_id UUID)
RETURNS TABLE (
  pattern        TEXT,
  modal_category TEXT,
  occurrences    BIGINT,
  last_seen      DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    rp.pattern,
    rp.modal_category,
    rp.occurrences,
    rp.last_seen
  FROM public.recurrence_patterns rp
  WHERE rp.client_id = p_client_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.classification_rules cr
      WHERE cr.client_id = rp.client_id
        AND cr.pattern = rp.pattern
        AND (
          cr.source = 'rejected'
          OR COALESCE(cr.is_recurring, false) = true
        )
    )
  ORDER BY rp.occurrences DESC;
$$;

CREATE OR REPLACE FUNCTION public.pending_recurrences_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)
  FROM public.recurrence_patterns rp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.classification_rules cr
    WHERE cr.client_id = rp.client_id
      AND cr.pattern = rp.pattern
      AND (
        cr.source = 'rejected'
        OR COALESCE(cr.is_recurring, false) = true
      )
  );
$$;

-- Trigger de aprendizado: ao reaprovar, não apagar is_recurring já confirmado;
-- se a tx vier marcada como recorrente, promove a regra.
CREATE OR REPLACE FUNCTION public.tg_learn_from_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pattern TEXT;
  v_count   INTEGER;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.category IS NULL OR TRIM(NEW.category) = '' THEN
    RETURN NEW;
  END IF;

  v_pattern := public.build_pattern(NEW.description);
  IF v_pattern IS NULL OR LENGTH(v_pattern) < 3 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.classification_rules
   WHERE client_id = NEW.client_id AND is_active = true;

  IF v_count >= 500 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.classification_rules
    (client_id, pattern, category, is_recurring, hits, source, is_active, last_used)
  VALUES
    (NEW.client_id, v_pattern, NEW.category, COALESCE(NEW.is_recurring, false),
     1, 'approval', false, now())
  ON CONFLICT (client_id, pattern) DO UPDATE
    SET hits      = classification_rules.hits + 1,
        category  = EXCLUDED.category,
        last_used = now(),
        is_recurring = classification_rules.is_recurring OR EXCLUDED.is_recurring,
        is_active = CASE
                      WHEN classification_rules.hits + 1 >= 2 THEN true
                      ELSE classification_rules.is_active
                    END;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "admin_all_rules" ON public.classification_rules;
CREATE POLICY "admin_all_rules" ON public.classification_rules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT EXECUTE ON FUNCTION public.pending_recurrences(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pending_recurrences_total() TO authenticated;

COMMIT;
