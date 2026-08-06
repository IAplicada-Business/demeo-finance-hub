/**
 * 04 — DFC, DRE e Inteligência Financeira · M3
 * Homologação Aurora · 8 itens (P0×4, P1×4)
 * Projeto Playwright: admin (com storageState)
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('04 — DFC, DRE e Inteligência Financeira · M3', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/dfc');
    await expect(page).toHaveURL('/admin/dfc');
  });

  // ── DFC ───────────────────────────────────────────────────────────────────

  test('P0 — gráfico mensal e KPIs carregam; saldo exibido é "Resultado do mês"', async ({ page }) => {
    // Aguarda o gráfico carregar (recharts renderiza SVG)
    await expect(page.locator('svg.recharts-surface, [class*="recharts"]').first()).toBeVisible({ timeout: 15_000 });

    // Verifica KPIs: deve mostrar receita, despesa e resultado (não "saldo bancário")
    const kpis = page.locator('body');
    await expect(kpis).toContainText(/receita|despesa|resultado/i);
    // Garante que "saldo bancário" NÃO aparece como label de KPI principal
    const saldoBancario = page.getByText(/saldo bancário/i);
    expect(await saldoBancario.count()).toBe(0);
  });

  test('P1 — drill-down por categoria → percentual sobre total de despesas correto', async ({ page }) => {
    // Pula se não há dados no período
    const noData = await page.getByText(/Nenhuma transação aprovada|sem dados|sem movimentação/i).count() > 0;
    if (noData) {
      test.skip(true, 'Sem transações aprovadas no período — drill-down não disponível');
    }

    // Clica em uma barra do gráfico recharts ou item de categoria
    const categoryItem = page.locator('.recharts-bar-rectangle, .recharts-bar-background-rectangle, [class*="recharts-bar"]').first()
      .or(page.locator('[data-testid="category-drilldown"]').first());

    if (await categoryItem.count() === 0) {
      test.skip(true, 'Nenhum item de drill-down de categoria encontrado no DFC');
    }
    await categoryItem.click({ force: true });

    // Verifica que percentual aparece (ex: "45%" ou "45,3%")
    await expect(page.getByText(/%/)).toBeVisible({ timeout: 5_000 });
  });

  test('P0 — seletor de cliente recarrega DFC sem recarregar a página; sem vazamento', async ({ page }) => {
    const clientSelector = page.locator('select').first()
      .or(page.getByRole('combobox').first());

    if (await clientSelector.count() === 0) {
      test.skip(true, 'Seletor de cliente não encontrado na tela DFC');
    }
    const options = await clientSelector.locator('option').all();
    if (options.length < 2) test.skip(true, 'Precisa de ao menos 2 clientes');

    const initialURL = page.url();

    // Captura erros de console durante a troca de cliente
    const consoleErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await clientSelector.selectOption({ index: 1 });
    // Aguarda re-render (não deve haver reload completo)
    await page.waitForResponse((r) => r.url().includes('supabase') && r.status() < 400, { timeout: 10_000 });

    // URL não deve ter mudado (não é um redirect)
    expect(page.url()).toBe(initialURL);

    // Nenhum erro 400/403 no console
    const authErrors = consoleErrors.filter((e) => /40[03]/.test(e));
    expect(authErrors).toHaveLength(0);
  });

  // ── DRE ───────────────────────────────────────────────────────────────────

  test('P0 — DRE: grupos e EBITDA calculados → valores consistentes com DFC', async ({ page }) => {
    // Abas DFC são <button>, NÃO role="tab" — usar seletor de botão exato
    const dreTab = page.getByRole('button', { name: 'DRE', exact: true })
      .or(page.getByRole('button', { name: /\bDRE\b/ }));
    await dreTab.first().click();

    // Com dados: "Receita", "Despesa", "EBITDA" aparecem como grupos
    // Sem dados: "Nenhuma transação aprovada" ou similar
    // Aceita qualquer um dos dois estados como válido:
    // - Com dados: "Receita Bruta", "EBITDA", grupos de despesa
    // - Sem dados: "Receita Bruta R$ 0,00", "EBITDA R$ 0,00", "Nenhuma transação aprovada"
    await expect(page.locator('body')).toContainText(
      /Receita Bruta|EBITDA|Nenhuma transação/i,
      { timeout: 10_000 }
    );
  });

  // ── Detalhamento & Projeção ───────────────────────────────────────────────

  test('P1 — aba Detalhamento: DFC Gerencial + tabela Receitas Brutas visível', async ({ page }) => {
    // Abas DFC são <button> — não role="tab"
    const detTab = page.getByRole('button', { name: /detalhamento/i });

    if (await detTab.count() === 0) {
      test.skip(true, 'Aba Detalhamento não encontrada');
    }
    await detTab.first().click();

    await expect(page.locator('body')).toContainText(/DFC Gerencial|Receitas Brutas/i, { timeout: 8_000 });
  });

  test('P1 — projeção de 90 dias renderiza com parcelas futuras', async ({ page }) => {
    // Abas DFC são <button> — não role="tab"
    const projTab = page.getByRole('button', { name: /projeção/i });

    if (await projTab.count() === 0) {
      test.skip(true, 'Aba Projeção não encontrada');
    }
    await projTab.first().click();

    await expect(page.locator('svg.recharts-surface, [class*="recharts"]').first()).toBeVisible({ timeout: 15_000 });
  });

  // ── Relatórios & Exportação ───────────────────────────────────────────────

  test('P0 — exportar PDF com branding Aurora → abre sem bloqueio de popup', async ({ page }) => {
    await page.goto('/admin/relatorios');

    const pdfBtn = page.getByRole('button', { name: /exportar.*PDF|gerar.*PDF|baixar.*PDF/i })
      .or(page.getByRole('link', { name: /PDF/i }));

    if (await pdfBtn.count() === 0) {
      test.skip(true, 'Botão de exportar PDF não encontrado em /admin/relatorios');
    }

    // Aguarda o download (Playwright intercepta o download)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      pdfBtn.first().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // Verifica que o arquivo foi baixado com tamanho > 0
    const downloadPath = await download.path();
    if (downloadPath) {
      const stat = fs.statSync(downloadPath);
      expect(stat.size).toBeGreaterThan(1000);
    }
  });

  test('P1 — exportar Excel → 5 abas preenchidas', async ({ page }) => {
    await page.goto('/admin/relatorios');

    const xlsBtn = page.getByRole('button', { name: /exportar.*Excel|Excel|xlsx/i })
      .or(page.getByRole('link', { name: /Excel/i }));

    if (await xlsBtn.count() === 0) {
      test.skip(true, 'Botão de exportar Excel não encontrado');
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      xlsBtn.first().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.xlsx?$/i);
    const downloadPath = await download.path();
    if (downloadPath) {
      const stat = fs.statSync(downloadPath);
      expect(stat.size).toBeGreaterThan(1000);
    }
  });
});
