-- Onda A: conciliação agenda (payables) ↔ extrato (transactions)

BEGIN;

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payable_id UUID REFERENCES public.payables(id) ON DELETE SET NULL;

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'extrato';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payable_id_unique
  ON public.transactions(payable_id) WHERE payable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payables_matched_tx_unique
  ON public.payables(matched_transaction_id) WHERE matched_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payables_open_client
  ON public.payables(client_id, due_date) WHERE paid_at IS NULL AND matched_transaction_id IS NULL;

CREATE OR REPLACE FUNCTION public.reconcile_payable(
  p_payable_id UUID,
  p_transaction_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payable payables%ROWTYPE;
  v_tx transactions%ROWTYPE;
  v_expected_amount NUMERIC(14,2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_payable FROM payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agenda não encontrada'; END IF;
  IF v_payable.paid_at IS NOT NULL OR v_payable.matched_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Agenda já quitada ou conciliada';
  END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF v_tx.client_id <> v_payable.client_id THEN
    RAISE EXCEPTION 'Cliente diferente entre agenda e extrato';
  END IF;
  IF v_tx.status <> 'approved' THEN
    RAISE EXCEPTION 'Somente lançamentos aprovados podem conciliar';
  END IF;
  IF v_tx.payable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento já vinculado a outra agenda';
  END IF;

  v_expected_amount := CASE WHEN v_payable.type = 'receber' THEN v_payable.amount ELSE -v_payable.amount END;
  IF ABS(ABS(v_tx.amount) - ABS(v_expected_amount)) > 0.01 THEN
    RAISE EXCEPTION 'Valor incompatível (agenda % vs extrato %)', v_payable.amount, ABS(v_tx.amount);
  END IF;
  IF (v_payable.type = 'pagar' AND v_tx.amount >= 0) OR (v_payable.type = 'receber' AND v_tx.amount <= 0) THEN
    RAISE EXCEPTION 'Tipo incompatível (pagar/receber vs sinal do extrato)';
  END IF;

  UPDATE transactions
  SET
    payable_id = p_payable_id,
    category = COALESCE(NULLIF(TRIM(category), ''), v_payable.category)
  WHERE id = p_transaction_id;

  UPDATE payables
  SET
    matched_transaction_id = p_transaction_id,
    paid_at = v_tx.date
  WHERE id = p_payable_id;

  RETURN p_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unreconcile_payable(p_payable_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payable payables%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT * INTO v_payable FROM payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agenda não encontrada'; END IF;

  IF v_payable.matched_transaction_id IS NOT NULL THEN
    UPDATE transactions SET payable_id = NULL WHERE id = v_payable.matched_transaction_id;
  END IF;

  UPDATE payables
  SET matched_transaction_id = NULL, paid_at = NULL
  WHERE id = p_payable_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_payment(
  p_payable_id UUID,
  p_date DATE DEFAULT CURRENT_DATE,
  p_bank TEXT DEFAULT 'Espécie'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payable payables%ROWTYPE;
  v_tx_id UUID;
  v_amount NUMERIC(14,2);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT * INTO v_payable FROM payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agenda não encontrada'; END IF;
  IF v_payable.paid_at IS NOT NULL OR v_payable.matched_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Agenda já quitada';
  END IF;

  v_amount := CASE WHEN v_payable.type = 'receber' THEN v_payable.amount ELSE -v_payable.amount END;

  INSERT INTO transactions (
    client_id, upload_id, date, description, raw_description, amount,
    category, bank, status, is_recurring, confidence, payable_id,
    approved_by, approved_at
  ) VALUES (
    v_payable.client_id, NULL, p_date, v_payable.description, v_payable.description, v_amount,
    v_payable.category, COALESCE(NULLIF(TRIM(p_bank), ''), 'Espécie'), 'approved', false, 100,
    p_payable_id, auth.uid(), now()
  )
  RETURNING id INTO v_tx_id;

  UPDATE payables
  SET matched_transaction_id = v_tx_id, paid_at = p_date
  WHERE id = p_payable_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_manual_payment(p_payable_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payable payables%ROWTYPE;
  v_tx transactions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT * INTO v_payable FROM payables WHERE id = p_payable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agenda não encontrada'; END IF;

  IF v_payable.matched_transaction_id IS NULL THEN
    UPDATE payables SET paid_at = NULL WHERE id = p_payable_id;
    RETURN;
  END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = v_payable.matched_transaction_id;
  IF v_tx.upload_id IS NOT NULL THEN
    PERFORM public.unreconcile_payable(p_payable_id);
    RETURN;
  END IF;

  DELETE FROM transactions WHERE id = v_tx.id;
  UPDATE payables SET matched_transaction_id = NULL, paid_at = NULL WHERE id = p_payable_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_payable(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unreconcile_payable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_payment(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_manual_payment(UUID) TO authenticated;

COMMIT;
