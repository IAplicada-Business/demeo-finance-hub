/**
 * 12 — Contas · Onda A (conciliar + pago dinheiro)
 * Homologação Aurora · P0×2
 * Projeto Playwright: admin (com storageState)
 */
import { test, expect } from '@playwright/test';
import {
  seedContasOndaAFixture,
  cleanupContasOndaAFixture,
  type ContasSeedFixture,
} from './helpers/supabase-seed';

test.describe('12 — Contas · Onda A', () => {
  let fixture: ContasSeedFixture;

  test.beforeAll(async () => {
    fixture = await seedContasOndaAFixture('Teste');
  });

  test.afterAll(async () => {
    if (fixture) await cleanupContasOndaAFixture(fixture);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/admin/dfc?clientId=${fixture.clientId}&tab=contas`);
    await expect(page.getByRole('button', { name: 'Agenda' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Contas a Pagar')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Carregando agenda...')).toHaveCount(0, { timeout: 15_000 });
  });

  async function showAllPayables(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /Exibir/i }).click();
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
  }

  test('P0 — conciliar payable com lançamento do extrato', async ({ page }) => {
    const row = page.locator('tr').filter({ hasText: fixture.reconcileDesc });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Conciliar' }).click();

    await expect(page.getByText(fixture.reconcileDesc).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vincular' }).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Vincular' }).first().click();

    await showAllPayables(page);
    const paidRow = page.locator('tr').filter({ hasText: fixture.reconcileDesc });
    await expect(
      paidRow.getByText('Conciliado').or(paidRow.getByText('Pago em dinheiro')).or(paidRow.getByText('Pago')),
    ).toBeVisible({ timeout: 10_000 });
    await paidRow.getByRole('button', { name: 'Desfazer' }).click();
    await expect(paidRow.getByText('Pendente').or(paidRow.getByText('Vencido'))).toBeVisible({
      timeout: 10_000,
    });
  });

  test('P0 — pago dinheiro registra baixa na Agenda', async ({ page }) => {
    const row = page.locator('tr').filter({ hasText: fixture.cashDesc });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: /Pago \(dinheiro\)/ }).click();

    await expect(page.getByText('Registrar no caixa?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await showAllPayables(page);
    const paidRow = page.locator('tr').filter({ hasText: fixture.cashDesc });
    await expect(paidRow.getByText('Pago em dinheiro')).toBeVisible({ timeout: 10_000 });

    await paidRow.getByRole('button', { name: 'Desfazer' }).click();
    await expect(paidRow.getByText('Pendente').or(paidRow.getByText('Vencido'))).toBeVisible({
      timeout: 10_000,
    });
  });
});
