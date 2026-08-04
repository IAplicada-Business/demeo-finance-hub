-- Extrato classificado sem categoria é inconsistente (ex.: confidence=100, category NULL).
-- Volta para pending e limpa confidence até a gestora escolher categoria.

UPDATE public.transactions
SET
  status = CASE WHEN status = 'classified' THEN 'pending' ELSE status END,
  confidence = NULL
WHERE upload_id IS NOT NULL
  AND status IN ('pending', 'classified')
  AND (category IS NULL OR BTRIM(category) = '');
