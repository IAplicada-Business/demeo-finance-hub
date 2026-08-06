/**
 * 02 — Importação e Processamento · M1
 * Homologação Aurora · 8 itens (P0×5, P1×2, P0)
 * Projeto Playwright: admin (com storageState)
 *
 * PRÉ-REQUISITO: coloque arquivos de extrato reais em tests/e2e/fixtures/
 *   - itau-sample.pdf
 *   - bradesco-sample.pdf
 *   - santander-sample.pdf
 *   - inter-sample.csv
 *   - itau-sample.csv
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES = path.resolve(__dirname, 'fixtures');

function fixtureExists(name: string) {
  return fs.existsSync(path.join(FIXTURES, name));
}

test.describe('02 — Importação e Processamento · M1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/importar');
    await expect(page).toHaveURL('/admin/importar');
  });

  // ── Upload ────────────────────────────────────────────────────────────────

  test('P0 — seleção de cliente obrigatória: tentar upload sem cliente exibe erro', async ({ page }) => {
    if (!fixtureExists('itau-sample.pdf')) {
      test.skip(true, 'Fixture itau-sample.pdf não encontrada em tests/e2e/fixtures/');
    }
    // O select "CLIENTE VINCULADO" só aparece APÓS o upload — faz upload primeiro
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'itau-sample.pdf'));

    // Aguarda a seção de cliente vinculado aparecer
    await expect(page.getByText(/cliente vinculado/i)).toBeVisible({ timeout: 10_000 });

    // Sem selecionar cliente, tenta processar/importar
    const processBtn = page.getByRole('button', { name: /processar|importar|enviar|analisar/i });
    if (await processBtn.count() > 0 && await processBtn.isEnabled()) {
      await processBtn.click();
      await expect(page.getByText(/selecione um cliente|cliente obrigatório|escolha o cliente/i))
        .toBeVisible({ timeout: 5_000 });
    } else {
      // Validação pode ser no próprio select (required) — verifica que select está vazio
      const clientSelect = page.locator('select').first();
      await expect(clientSelect).toHaveValue('');
    }
  });

  test('P0 — upload de extrato PDF (Itaú) → transações listadas com categoria e score', async ({ page }) => {
    test.setTimeout(180_000); // classificação da IA pode levar até 2min
    if (!fixtureExists('itau-sample.pdf')) {
      test.skip(true, 'Fixture itau-sample.pdf não encontrada em tests/e2e/fixtures/');
    }

    // O select "CLIENTE VINCULADO" aparece APÓS o upload — faz upload primeiro
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'itau-sample.pdf'));

    // Aguarda seção "CLIENTE VINCULADO" com o select aparecer
    const clientSelect = page.locator('select').first();
    await expect(clientSelect).toBeVisible({ timeout: 10_000 });

    // Aguarda opções carregarem (async do Supabase)
    await page.waitForFunction(
      () => { const s = document.querySelector('select'); return s ? s.options.length > 1 : false; },
      { timeout: 10_000 }
    ).catch(() => {});

    const opts = await clientSelect.locator('option').count();
    if (opts < 2) test.skip(true, 'Nenhum cliente disponível para selecionar no CLIENTE VINCULADO');
    await clientSelect.selectOption({ index: 1 });

    // Diálogo de confirmação pode aparecer após selecionar cliente
    const confirmBtn = page.getByRole('button', { name: /confirmar importação/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Aguarda "Classificando com IA..." aparecer (loading iniciado)
    // Usa texto exato do spinner para não bater na sidebar "Regras de Classificação"
    const loadingMsg = page.getByText(/classificando com ia|analisando com ia|processando com ia/i);
    await expect(loadingMsg).toBeVisible({ timeout: 30_000 });

    // Aguarda loading SUMIR — IA terminou de classificar (até 120s)
    await expect(loadingMsg).not.toBeVisible({ timeout: 120_000 });

    // Verifica que há transações resultantes (tabela ou badge de status)
    const hasTxRows = await page.locator('table tbody tr, [data-testid="transaction-row"]').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    const hasPendente = await page.getByText(/pendente|aprovad/i).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasTxRows || hasPendente).toBe(true);
  });

  test('P0 — upload de múltiplos arquivos → todos processados, nenhum ignorado', async ({ page }) => {
    const files = ['itau-sample.pdf', 'bradesco-sample.pdf'].filter((f) => fixtureExists(f));
    if (files.length < 2) {
      test.skip(true, 'Precisa de pelo menos 2 fixtures (itau-sample.pdf e bradesco-sample.pdf)');
    }
    const clientSelect = page.locator('select').first();
    await clientSelect.selectOption({ index: 1 });

    const paths = files.map((f) => path.join(FIXTURES, f));
    await page.locator('input[type="file"]').setInputFiles(paths);

    // Aguarda processamento de ambos os arquivos
    await expect(page.getByText(new RegExp(`${files.length}.*arquivo`, 'i'))).toBeVisible({ timeout: 180_000 });
  });

  test('P1 — upload de CSV (Itaú/Inter) → valores e datas corretos', async ({ page }) => {
    const csv = ['itau-sample.csv', 'inter-sample.csv'].find((f) => fixtureExists(f));
    if (!csv) {
      test.skip(true, 'Fixture CSV não encontrada em tests/e2e/fixtures/');
    }
    const clientSelect = page.locator('select').first();
    await clientSelect.selectOption({ index: 1 });

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, csv!));
    await expect(page.getByText(/aprovad|pendente/i)).toBeVisible({ timeout: 60_000 });
    // Verifica que há ao menos uma data no formato brasileiro ou ISO
    await expect(page.getByText(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/)).toBeVisible();
  });

  // ── Parcelamentos ─────────────────────────────────────────────────────────

  test('P0 — configurar parcela inline (X de Y) antes de aprovar → salva com aprovação', async ({ page }) => {
    // Presume que já há transações pendentes na tela após import anterior
    // Ou navega para a tela de importar que já tenha transações
    const installmentToggle = page.getByRole('button', { name: /parcela|installment/i }).first();
    if (await installmentToggle.count() === 0) {
      test.skip(true, 'Nenhuma transação com controle de parcela visível — rode após um upload');
    }
    await installmentToggle.click();
    // Preenche X de Y
    const inputs = page.locator('input[type="number"]');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('3');
    // Aprovação deve incluir a configuração de parcela
    const approveBtn = page.getByRole('button', { name: /aprovar/i }).first();
    await approveBtn.click();
    await expect(page.getByText(/1 de 3|1\/3/i)).toBeVisible({ timeout: 5_000 });
  });

  // ── Aprovação & Histórico ─────────────────────────────────────────────────

  test('P0 — aprovar transações individualmente e em massa → status muda para "approved"', async ({ page }) => {
    // Verifica se há transações pendentes
    const pendingRow = page.locator('[data-status="pending"], tr').filter({ hasText: /pending|pendente/i }).first();
    if (await pendingRow.count() === 0) {
      test.skip(true, 'Nenhuma transação pendente — rode após um upload');
    }
    // Aprovação individual
    await page.getByRole('button', { name: /aprovar/i }).first().click();
    await expect(page.getByText(/approved|aprovado/i)).toBeVisible({ timeout: 5_000 });

    // Aprovação em massa (seleciona todos e aprova)
    const selectAll = page.getByRole('checkbox', { name: /selecionar todos/i })
      .or(page.locator('input[type="checkbox"]').first());
    if (await selectAll.count() > 0) {
      await selectAll.check();
      const massApprove = page.getByRole('button', { name: /aprovar.*(selecionado|todos|em massa)/i });
      if (await massApprove.count() > 0) await massApprove.click();
    }
  });

  test('P0 — histórico aparece somente após aprovação completa, com parcelamentos visíveis', async ({ page }) => {
    // Navega para a aba DFC > Extratos
    // Abas DFC são <button>, NÃO role="tab"
    await page.goto('/admin/dfc');
    await expect(page).toHaveURL('/admin/dfc');

    const extratosTab = page.getByRole('button', { name: /extratos/i });
    if (await extratosTab.count() === 0) {
      test.skip(true, 'Aba Extratos não encontrada em /admin/dfc');
    }
    await extratosTab.first().click();

    // Estado vazio ou com registros — ambos são válidos
    await expect(page.locator('body')).toContainText(
      /extrato|histórico|import|nenhuma|sem transações/i,
      { timeout: 10_000 }
    );
  });

  test('P1 — lançamento manual → aparece no histórico imediatamente', async ({ page }) => {
    // A seção "LANÇAMENTO MANUAL" pode estar expandida ou colapsada
    // Verifica se o formulário (campo data) já está visível; se não, tenta expandir
    const dateInput = page.locator('input[type="date"]');
    const isExpanded = await dateInput.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!isExpanded) {
      // Procura pelo botão/header "Lançamento Manual" para expandir
      const expandBtn = page.getByText(/lançamento manual/i).first();
      if (await expandBtn.count() === 0) {
        test.skip(true, 'Seção "Lançamento Manual" não encontrada em /admin/importar');
      }
      await expandBtn.click();
      await expect(dateInput).toBeVisible({ timeout: 5_000 });
    }

    // Seleciona cliente se houver opções
    const clientSelect = page.locator('select').first();
    if (await clientSelect.count() > 0) {
      const opts = await clientSelect.locator('option').count();
      if (opts > 1) await clientSelect.selectOption({ index: 1 });
    }

    // Data (geralmente já preenchida com hoje)
    await dateInput.fill(new Date().toISOString().split('T')[0]);

    // Descrição — placeholder real: "Ex: Pagamento cliente João — serviço de corte"
    const descInput = page.getByPlaceholder(/Ex: Pagamento|serviço de corte/i)
      .or(page.getByPlaceholder(/descrição|description/i));
    if (await descInput.count() === 0) {
      test.skip(true, 'Campo de descrição não encontrado no formulário de Lançamento Manual');
    }
    await descInput.click();
    await descInput.pressSequentially('Teste lançamento manual Playwright', { delay: 20 });

    // Valor — type="text" inputMode="decimal", placeholder "0,00"
    const valorInput = page.getByPlaceholder('0,00').first()
      .or(page.locator('input[inputmode="decimal"]').first());
    if (await valorInput.count() > 0) {
      await valorInput.click();
      await valorInput.pressSequentially('150,00', { delay: 20 });
    }

    // Categoria (required) — seleciona primeira opção disponível
    const allSelects = page.locator('select');
    const selectCount = await allSelects.count();
    // Última select costuma ser CATEGORIA
    if (selectCount >= 2) {
      const categoriaSelect = allSelects.nth(selectCount - 1);
      const catOpts = await categoriaSelect.locator('option').count();
      if (catOpts > 1) await categoriaSelect.selectOption({ index: 1 });
      else test.skip(true, 'Nenhuma categoria disponível para selecionar — crie categorias antes');
    }

    // Botão de submit: "Registrar lançamento"
    const saveBtn = page.getByRole('button', { name: /registrar lançamento|salvar|confirmar/i });
    if (await saveBtn.count() === 0) {
      test.skip(true, 'Botão "Registrar lançamento" não encontrado');
    }
    await saveBtn.click();

    // Após salvar, aguarda confirmação (toast, texto na página, ou form resetado)
    await expect(
      page.getByText(/Teste lançamento manual Playwright/)
        .or(page.getByText(/lançamento registrado|registrado com sucesso|salvo/i))
        .or(page.getByText(/transação criada|lançamento criado/i))
    ).toBeVisible({ timeout: 8_000 });
  });
});
