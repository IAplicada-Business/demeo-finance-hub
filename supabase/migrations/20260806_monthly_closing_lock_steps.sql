-- Impede alterar etapas do checklist enquanto o fechamento estiver concluído.
-- Reabrir (completed_at → NULL) continua permitido; o front também bloqueia na UI.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_monthly_closing_lock_steps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    IF NEW.step1_done IS DISTINCT FROM OLD.step1_done
       OR NEW.step2_done IS DISTINCT FROM OLD.step2_done
       OR NEW.step3_done IS DISTINCT FROM OLD.step3_done
       OR NEW.step4_done IS DISTINCT FROM OLD.step4_done THEN
      RAISE EXCEPTION 'Fechamento concluído — reabra antes de alterar etapas';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monthly_closing_lock_steps ON public.monthly_closings;

CREATE TRIGGER trg_monthly_closing_lock_steps
  BEFORE UPDATE ON public.monthly_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_monthly_closing_lock_steps();

COMMIT;
