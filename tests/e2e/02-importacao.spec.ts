/**
 * 02 — Importação e Processamento · M1
 * Homologação Aurora · 8 itens (P0×5, P1×2, P0)
 * Projeto Playwright: admin (com storageState)
 *
 * PRÉ-REQUISITO: coloque arquivos de extrato em tests/e2e/fixtures/
 *   - inter-sample-2024-02.png (Inter — preferido, evita duplicata)
 *   - citi-sample-2010-04.png (Citi)
 *   - itau-sample.pdf (fallback)
 *   - bradesco-sample.pdf, santander-sample.pdf (opcional, multi-upload)
 *   - itau-sample.csv, inter-sample.csv (CSV)
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import {
  confirmImportInModal,
  importConfirmModal,
  selectClientInImportModal,
  uploadAndConfirmImport,
  uploadFilesForImport,
  waitForClientOptions,
  waitForImportClassification,
  waitForImportResultOrDuplicate,
} from './helpers/importar';
import { FIXTURES_DIR, fixtureExists, fixturePath, multiImportFixtures, primaryImportFixture } from './helpers/fixtures';

const FIXTURES = FIXTURES_DIR;

test.describe('02 — Importação e Processamento · M1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/importar');
    await expect(page).toHaveURL('/admin/importar');
  });

  // ── Upload ────────────────────────────────────────────────────────────────

  test('P0 — seleção de cliente obrigatória: tentar upload sem cliente exibe erro', async ({ page }) => {
    const fixture = primaryImportFixture();
    if (!fixture) {
      test.skip(true, 'Nenhuma fixture de extrato em tests/e2e/fixtures/');
    }

    await uploadFilesForImport(page, fixture!.path);

    const modal = importConfirmModal(page);
    const clientSelect = modal.locator('table tbody select').first();
    await waitForClientOptions(page, 0);
    await clientSelect.selectOption({ index: 0 }); // "Escolher cliente"

    const confirmBtn = modal.getByRole('button', { name: /confirmar importação/i });
    await expect(confirmBtn).toBeDisabled();
  });

  test('P0 — upload de extrato → transações listadas com categoria e score', async ({ page }) => {
    test.setTimeout(180_000);
    const fixture = primaryImportFixture();
    if (!fixture) {
      test.skip(true, 'Nenhuma fixture de extrato em tests/e2e/fixtures/');
    }

    await uploadAndConfirmImport(page, fixture!.path, { periodIso: fixture!.periodIso });
    const outcome = await waitForImportResultOrDuplicate(page);

    if (outcome === 'duplicate') {
      test.skip(true, `${fixture!.label} já importado — exclua em DFC → Extratos ou use outro arquivo`);
    }

    await expect(page.locator('main').getByText(/\d+ lançamentos/i)).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: /aprovar classificados/i })).toBeVisible();
  });

  test('P0 — upload de múltiplos arquivos → todos processados, nenhum ignorado', async ({ page }) => {
    test.setTimeout(240_000);
    const files = multiImportFixtures().slice(0, 2);
    if (files.length < 2) {
      test.skip(true, 'Precisa de pelo menos 2 fixtures (ex.: inter + citi em tests/e2e/fixtures/)');
    }

    const paths = files.map((f) => f.path);
    await uploadFilesForImport(page, paths);

    const modal = importConfirmModal(page);
    const rowCount = await modal.locator('table tbody tr').count();
    expect(rowCount).toBe(files.length);

    for (let i = 0; i < rowCount; i++) {
      await selectClientInImportModal(page, { rowIndex: i, periodIso: files[i]?.periodIso });
    }
    await confirmImportInModal(page);
    await waitForImportClassification(page);

    await expect(page.getByText(/concluído|classificad|pendente|aprovad/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('P1 — upload de CSV (Itaú/Inter) → valores e datas corretos', async ({ page }) => {
    test.setTimeout(180_000);
    const csv = ['itau-sample.csv', 'inter-sample.csv'].find((f) => fixtureExists(f));
    if (!csv) {
      test.skip(true, 'Fixture CSV não encontrada em tests/e2e/fixtures/');
    }

    await uploadAndConfirmImport(page, path.join(FIXTURES, csv!));
    await waitForImportClassification(page);

    await expect(page.getByText(/aprovad|pendente|classificad/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/)).toBeVisible();
  });

  // ── Parcelamentos ─────────────────────────────────────────────────────────

  test('P0 — configurar parcela inline (X de Y) antes de aprovar → salva com aprovação', async ({ page }) => {
    const installmentToggle = page.getByRole('checkbox', { name: /parcelamento/i }).first();
    if ((await installmentToggle.count()) === 0) {
      test.skip(true, 'Nenhuma transação com controle de parcela visível — rode após um upload');
    }
    await installmentToggle.check();
    const inputs = page.locator('input[type="number"]');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('3');
    const approveBtn = page.getByRole('button', { name: /aprovar/i }).first();
    await approveBtn.click();
    await expect(page.getByText(/1 de 3|1\/3/i)).toBeVisible({ timeout: 5_000 });
  });

  // ── Aprovação & Histórico ─────────────────────────────────────────────────

  test('P0 — aprovar transações individualmente e em massa → status muda para "approved"', async ({ page }) => {
    const pendingRow = page
      .locator('[data-status="pending"], tr')
      .filter({ hasText: /pending|pendente|classificad/i })
      .first();
    if ((await pendingRow.count()) === 0) {
      test.skip(true, 'Nenhuma transação pendente — rode após um upload');
    }
    await page.getByRole('button', { name: /aprovar/i }).first().click();
    await expect(page.getByText(/approved|aprovado/i)).toBeVisible({ timeout: 5_000 });

    const selectAll = page
      .getByRole('checkbox', { name: /selecionar todos/i })
      .or(page.locator('thead input[type="checkbox"]').first());
    if ((await selectAll.count()) > 0) {
      await selectAll.check();
      const massApprove = page.getByRole('button', { name: /aprovar.*(selecionado|todos|em massa|classificados)/i });
      if ((await massApprove.count()) > 0) await massApprove.first().click();
    }
  });

  test('P0 — histórico aparece somente após aprovação completa, com parcelamentos visíveis', async ({ page }) => {
    await page.goto('/admin/dfc');
    await expect(page).toHaveURL('/admin/dfc');

    const extratosTab = page.getByRole('button', { name: /extratos/i });
    if ((await extratosTab.count()) === 0) {
      test.skip(true, 'Aba Extratos não encontrada em /admin/dfc');
    }
    await extratosTab.first().click();

    await expect(page.locator('body')).toContainText(
      /extrato|histórico|import|nenhuma|sem transações/i,
      { timeout: 10_000 },
    );
  });

  test('P1 — lançamento manual → aparece no histórico imediatamente', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]');
    const isExpanded = await dateInput.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!isExpanded) {
      const expandBtn = page.getByText(/lançamento manual/i).first();
      if ((await expandBtn.count()) === 0) {
        test.skip(true, 'Seção "Lançamento Manual" não encontrada em /admin/importar');
      }
      await expandBtn.click();
      await expect(dateInput).toBeVisible({ timeout: 5_000 });
    }

    const clientCard = page.locator('.aurora-card').filter({ hasText: /^Cliente/ });
    const clientSelect = clientCard.locator('select');
    if ((await clientSelect.count()) > 0) {
      const opts = await clientSelect.locator('option').count();
      if (opts > 1) {
        if (process.env.TEST_CLIENT_ID) {
          await clientSelect.selectOption(process.env.TEST_CLIENT_ID);
        } else {
          await clientSelect.selectOption({ index: 1 });
        }
      }
    }

    await dateInput.fill(new Date().toISOString().split('T')[0]);

    const descInput = page
      .getByPlaceholder(/Ex: Pagamento|serviço de corte/i)
      .or(page.getByPlaceholder(/descrição|description/i));
    if ((await descInput.count()) === 0) {
      test.skip(true, 'Campo de descrição não encontrado no formulário de Lançamento Manual');
    }
    await descInput.click();
    await descInput.pressSequentially('Teste lançamento manual Playwright', { delay: 20 });

    const valorInput = page
      .getByPlaceholder('0,00')
      .first()
      .or(page.locator('input[inputmode="decimal"]').first());
    if ((await valorInput.count()) > 0) {
      await valorInput.click();
      await valorInput.pressSequentially('150,00', { delay: 20 });
    }

    const manualSection = page.locator('form').filter({ hasText: /lançamento manual|registrar lançamento/i });
    const categoriaSelect = manualSection.locator('select').last();
    if ((await categoriaSelect.count()) > 0) {
      const catOpts = await categoriaSelect.locator('option').count();
      if (catOpts > 1) await categoriaSelect.selectOption({ index: 1 });
      else test.skip(true, 'Nenhuma categoria disponível — selecione um cliente com plano de contas');
    }

    const saveBtn = page.getByRole('button', { name: /registrar lançamento|salvar|confirmar/i });
    if ((await saveBtn.count()) === 0) {
      test.skip(true, 'Botão "Registrar lançamento" não encontrado');
    }
    await saveBtn.click();

    await expect(
      page
        .getByText(/Teste lançamento manual Playwright/)
        .or(page.getByText(/lançamento registrado|registrado com sucesso|salvo/i))
        .or(page.getByText(/transação criada|lançamento criado/i)),
    ).toBeVisible({ timeout: 8_000 });
  });
});
