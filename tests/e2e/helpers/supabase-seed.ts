import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

function loadEnvFile(filepath: string) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    const val = raw.replace(/^(['"])(.*)\1$/, '$2').replace(/^<(.*)>$/, '$1');
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(ROOT, '.env.test'));

export interface ContasSeedFixture {
  clientId: string;
  clientName: string;
  reconcileDesc: string;
  reconcilePayableId: string;
  reconcileTxId: string;
  cashDesc: string;
  cashPayableId: string;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Variável ${key} ausente (.env / .env.test)`);
  return val;
}

async function adminClient(): Promise<SupabaseClient> {
  const sb = createClient(
    requireEnv('VITE_SUPABASE_URL'),
    requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
  );
  const { error } = await sb.auth.signInWithPassword({
    email: requireEnv('TEST_ADMIN_EMAIL'),
    password: requireEnv('TEST_ADMIN_PASSWORD'),
  });
  if (error) throw new Error(`Auth admin E2E: ${error.message}`);
  return sb;
}

export async function seedContasOndaAFixture(clientName = 'Teste'): Promise<ContasSeedFixture> {
  const sb = await adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();

  const { data: client } = await sb
    .from('clients')
    .select('id, name')
    .is('deleted_at', null)
    .ilike('name', `%${clientName}%`)
    .limit(1)
    .maybeSingle();

  if (!client) throw new Error(`Cliente E2E não encontrado: ${clientName}`);

  const { data: upload } = await sb
    .from('uploads')
    .select('id')
    .eq('client_id', client.id)
    .in('status', ['done', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reconcileDesc = `[e2e-contas ${stamp}] Conciliar QA`;
  const cashDesc = `[e2e-contas ${stamp}] Dinheiro QA`;
  const amount = 77.77;

  const { data: payable, error: pErr } = await sb
    .from('payables')
    .insert({
      client_id: client.id,
      type: 'pagar',
      description: reconcileDesc,
      amount,
      due_date: today,
    })
    .select('id')
    .single();
  if (pErr || !payable) throw new Error(pErr?.message ?? 'Falha ao criar payable conciliação');

  const { data: tx, error: tErr } = await sb
    .from('transactions')
    .insert({
      client_id: client.id,
      upload_id: upload?.id ?? null,
      date: today,
      description: reconcileDesc + ' PIX',
      raw_description: reconcileDesc,
      amount: -amount,
      bank: 'Itaú',
      status: 'approved',
      category: 'Despesas',
    })
    .select('id')
    .single();
  if (tErr || !tx) throw new Error(tErr?.message ?? 'Falha ao criar tx conciliação');
  if (!upload?.id) {
    console.warn('[e2e-contas] Cliente sem upload aprovado — badge pode ser "Pago em dinheiro"');
  }

  const { data: cashPayable, error: cErr } = await sb
    .from('payables')
    .insert({
      client_id: client.id,
      type: 'pagar',
      description: cashDesc,
      amount: 33.33,
      due_date: today,
    })
    .select('id')
    .single();
  if (cErr || !cashPayable) throw new Error(cErr?.message ?? 'Falha ao criar payable dinheiro');

  await sb.auth.signOut();

  return {
    clientId: client.id,
    clientName: client.name,
    reconcileDesc,
    reconcilePayableId: payable.id,
    reconcileTxId: tx.id,
    cashDesc,
    cashPayableId: cashPayable.id,
  };
}

export async function cleanupContasOndaAFixture(fixture: ContasSeedFixture) {
  const sb = await adminClient();

  for (const payableId of [fixture.reconcilePayableId, fixture.cashPayableId]) {
    try {
      await sb.rpc('undo_manual_payment', { p_payable_id: payableId });
    } catch {
      /* noop */
    }
    try {
      await sb.rpc('unreconcile_payable', { p_payable_id: payableId });
    } catch {
      /* noop */
    }
    await sb.from('payables').delete().eq('id', payableId);
  }

  if (fixture.reconcileTxId) {
    await sb.from('transactions').delete().eq('id', fixture.reconcileTxId);
  }

  await sb.from('payables').delete().ilike('description', '[e2e-contas %');
  await sb.from('transactions').delete().ilike('description', '[e2e-contas %');

  await sb.auth.signOut();
}
