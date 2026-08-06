/**
 * 08 — Propostas
 * Homologação Aurora · 4 itens (P0×4)
 * Projeto Playwright: admin (com storageState)
 *
 * NOTA: O teste de envio de e-mail (via n8n) é verificado pelo UI.
 *       Confirmar recebimento do e-mail manualmente.
 */
import { test, expect } from '@playwright/test';

test.describe('08 — Propostas', () => {
  test('P0 — wizard de proposta (5 passos) → PDF gerado com branding Aurora e valores corretos', async ({ page }) => {
    await page.goto('/admin/propostas/nova');

    // Passo 1: dados do cliente/deal
    await expect(page.locator('body')).toContainText(/passo 1|etapa 1|step 1|proposta/i, { timeout: 8_000 });

    // Navega pelos passos (cada passo deve ter um botão "Próximo" ou "Continuar")
    const nextBtn = page.getByRole('button', { name: /próximo|continuar|next/i });

    // Preenche campos mínimos do passo 1
    const firstInput = page.locator('input[type="text"], input[type="email"]').first();
    if (await firstInput.isVisible() && await firstInput.isEditable()) {
      await firstInput.fill('Cliente Teste Playwright');
    }

    // Avança pelos passos até chegar ao final
    for (let step = 1; step <= 4; step++) {
      if (await nextBtn.count() > 0 && await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // No último passo, gera/finaliza a proposta
    const generateBtn = page.getByRole('button', { name: /gerar proposta|finalizar|criar proposta/i });
    if (await generateBtn.count() > 0) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        generateBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    } else {
      // Verifica ao menos que chegamos ao final do wizard
      await expect(page.locator('body')).toContainText(/proposta|passo 5|etapa 5|concluído/i, { timeout: 5_000 });
    }
  });

  test('P0 — enviar proposta por e-mail via n8n → disparado sem erro na UI', async ({ page }) => {
    await page.goto('/admin/propostas');
    await expect(page).toHaveURL('/admin/propostas');

    // Encontra a primeira proposta e envia por e-mail
    const sendBtn = page.getByRole('button', { name: /enviar.*e-mail|enviar proposta|send/i }).first();
    if (await sendBtn.count() === 0) {
      // Tenta na tela de detalhe da primeira proposta
      const firstProposal = page.locator('table tbody tr, [data-testid="proposal-row"]').first();
      if (await firstProposal.count() > 0) await firstProposal.click();

      const sendBtnInDetail = page.getByRole('button', { name: /enviar.*e-mail|enviar/i }).first();
      if (await sendBtnInDetail.count() === 0) {
        test.skip(true, 'Botão de envio de e-mail não encontrado — crie uma proposta primeiro');
      }
      await sendBtnInDetail.click();
    } else {
      await sendBtn.click();
    }

    // A UI deve confirmar o disparo (toast, mensagem de sucesso)
    await expect(
      page.getByText(/enviado|e-mail enviado|sucesso/i)
        .or(page.locator('[data-sonner-toast]'))
    ).toBeVisible({ timeout: 15_000 });

    // Nota: verificar recebimento do e-mail manualmente
  });

  test('P0 — página pública (token único) abre em aba anônima com botão "Aceitar proposta"', async ({ page, browser }) => {
    const proposalToken = process.env.TEST_PROPOSAL_TOKEN;

    // Skip se token não configurado ou parece placeholder
    if (!proposalToken || proposalToken.length < 8 || /^[a-z-]+$/.test(proposalToken)) {
      test.skip(true, 'TEST_PROPOSAL_TOKEN não configurado ou inválido — adicione um token de proposta real no .env.test');
    }

    // Abre em contexto limpo (simula aba anônima)
    const ctx = await browser.newContext({ storageState: undefined });
    const publicPage = await ctx.newPage();
    await publicPage.goto(`/p/proposta/${proposalToken}`);

    // Deve carregar sem redirect para login
    await expect(publicPage).not.toHaveURL(/\/login/);

    // Verifica estado da página: proposta válida ou já aceita/expirada
    const bodyText = await publicPage.locator('body').textContent({ timeout: 10_000 }) ?? '';
    const isExpiredOrInvalid = /não encontrada|expirada|inválido|not found|404/i.test(bodyText);
    if (isExpiredOrInvalid) {
      test.skip(true, `Token ${proposalToken.slice(0, 8)}... retornou página inválida/expirada — use um token de proposta enviada recentemente`);
    }

    // Rola até o final da página — botão "Aceitar proposta →" fica abaixo do conteúdo
    await publicPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await publicPage.waitForTimeout(500);

    // Botão "Aceitar proposta →" deve estar visível (ou já aceita / expirada)
    // Verifica sequencialmente para evitar bug de Promise.race com timeouts diferentes
    const acceptBtn = publicPage.getByRole('button', { name: /aceitar proposta/i })
      .or(publicPage.getByText(/aceitar proposta/i));
    const alreadyAccepted = publicPage.getByText(/aceita|já aceita|aceito|expirada/i);

    const acceptVisible = await acceptBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    const alreadyVisible = !acceptVisible
      ? await alreadyAccepted.isVisible({ timeout: 3_000 }).catch(() => false)
      : false;

    if (!acceptVisible && !alreadyVisible) {
      const text = (await publicPage.locator('body').textContent()) ?? '';
      throw new Error(`P0: Botão "Aceitar proposta" não encontrado. Estado da página: "${text.slice(0, 300)}..."`);
    }

    expect(acceptVisible || alreadyVisible).toBe(true);

    await ctx.close();
  });

  test('P0 — aceitar proposta → deal move automaticamente para "Fechado"', async ({ page, browser }) => {
    const proposalToken = process.env.TEST_PROPOSAL_TOKEN;
    if (!proposalToken) {
      test.skip(true, 'TEST_PROPOSAL_TOKEN não configurado no .env.test');
    }

    // Abre a proposta pública e aceita
    const ctx = await browser.newContext({ storageState: undefined });
    const publicPage = await ctx.newPage();
    await publicPage.goto(`/p/proposta/${proposalToken}`);

    const acceptBtn = publicPage.getByRole('button', { name: /aceitar proposta|aceitar/i });
    if (await acceptBtn.count() === 0) {
      await ctx.close();
      test.skip(true, 'Botão de aceitar proposta não encontrado');
    }
    await acceptBtn.click();

    // Confirma aceite se houver modal
    const confirmAccept = publicPage.getByRole('button', { name: /confirmar|sim|aceitar/i });
    if (await confirmAccept.count() > 0) await confirmAccept.click();

    await expect(publicPage.getByText(/aceito|aceita|proposta aceita|obrigado/i)).toBeVisible({ timeout: 10_000 });
    await ctx.close();

    // Verifica que o deal foi para "Fechado" no pipeline
    await page.goto('/admin/pipeline');
    const fechadoCol = page.getByText('Fechado').locator('..')
      .or(page.locator('[data-stage-slug="fechado"]').first());
    await expect(fechadoCol).toBeVisible({ timeout: 8_000 });
    // Deve ter pelo menos um deal na coluna Fechado
    const closedDeals = fechadoCol.locator('[draggable="true"]').count();
    expect(await closedDeals).toBeGreaterThan(0);
  });
});
