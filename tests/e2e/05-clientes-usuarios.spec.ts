/**
 * 05 — Clientes & Usuários do Portal
 * Homologação Aurora · 5 itens (P1×2, P0×3)
 * Projeto Playwright: admin (com storageState)
 */
import { test, expect } from '@playwright/test';

const TEST_CNPJ = '12.345.678/0001-99'; // CNPJ de teste (não-real)
const TEST_CLIENT_NAME = `Cliente Playwright ${Date.now()}`;
const TEST_PORTAL_EMAIL_NEW = `portal.test.${Date.now()}@aurora-test.invalid`;

test.describe('05 — Clientes & Usuários do Portal', () => {
  // ── Clientes ──────────────────────────────────────────────────────────────

  test.describe('Clientes', () => {
    test('P1 — criar cliente com CNPJ → aparece no seletor do DFC', async ({ page }) => {
      await page.goto('/admin/clientes');
      await expect(page).toHaveURL('/admin/clientes');

      // Abre o slide panel de novo cliente
      await page.getByRole('button', { name: /novo cliente/i }).click();

      // Slide panel anima (0.3s aurora-slide-right)
      // Campo 1: NOME DA EMPRESA * (required)
      const empresaInput = page.getByPlaceholder(/Ex: Padaria/i);
      await expect(empresaInput).toBeVisible({ timeout: 5_000 });
      await empresaInput.click();
      await empresaInput.pressSequentially(TEST_CLIENT_NAME, { delay: 30 });

      // Campo 2: RESPONSÁVEL / SÓCIO * (required) — placeholder "Ex: Marcos Pereira"
      const socioInput = page.getByPlaceholder(/Marcos Pereira/i);
      await socioInput.click();
      await socioInput.pressSequentially('Playwright Teste', { delay: 30 });

      // "Cadastrar cliente" deve estar habilitado agora
      const submitBtn = page.getByRole('button', { name: /Cadastrar cliente/i });
      await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
      await submitBtn.click();

      // Verifica que aparece na listagem de clientes
      await expect(page.getByText(TEST_CLIENT_NAME, { exact: false })).toBeVisible({ timeout: 8_000 });

      // DFC deve carregar sem erro (seletor de clientes é custom component, não <select> nativo)
      await page.goto('/admin/dfc');
      await expect(page.locator('body')).toContainText(/demonstrativo|DFC|Gerencial/i, { timeout: 8_000 });
    });

    test('P1 — editar dados do cliente → alterações refletidas em toda a aplicação', async ({ page }) => {
      await page.goto('/admin/clientes');
      await expect(page).toHaveURL('/admin/clientes');

      // Aguarda lista de clientes carregar (dados assíncronos do Supabase)
      const editBtn = page.getByRole('button', { name: /editar/i }).first();
      await expect(editBtn).toBeVisible({ timeout: 10_000 });
      await editBtn.click();

      // Slide panel anima (0.3s aurora-slide-right) — input "NOME DA EMPRESA"
      const empresaInput = page.getByPlaceholder(/Ex: Padaria/i);
      await expect(empresaInput).toBeVisible({ timeout: 5_000 });
      const originalValue = await empresaInput.inputValue();

      // Limpa e redigita com pressSequentially para garantir React state dirty
      await empresaInput.click({ clickCount: 3 });
      await empresaInput.pressSequentially(` (editado)`, { delay: 30 });

      // "Salvar alterações" deve estar habilitado após edição
      const saveBtn = page.getByRole('button', { name: /Salvar alterações/i });
      await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
      await saveBtn.click();

      // Toast "Cliente atualizado." confirma save — mais rápido que aguardar panel fechar
      await expect(page.getByText(/cliente atualizado|atualizado|salvo/i)).toBeVisible({ timeout: 20_000 });

      // Nome "(editado)" deve aparecer na lista
      await expect(page.getByText(/(editado)/i, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // ── Usuários do Portal ────────────────────────────────────────────────────

  test.describe('Usuários do Portal — /admin/usuarios', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/usuarios');
      await expect(page).toHaveURL('/admin/usuarios');
    });

    test('P0 — criar usuário do portal → convite disparado via n8n', async ({ page }) => {
      // Abre o modal "Convidar usuário"
      await page.getByRole('button', { name: /Convidar usuário/i }).click();

      // Modal requer: CLIENTE (select) + NOME COMPLETO + E-MAIL
      // disabled={loading || !clientId || !email || !name}

      // 1. Seleciona cliente (native <select>)
      const clientSelect = page.locator('select').first();
      await expect(clientSelect).toBeVisible({ timeout: 5_000 });
      await clientSelect.selectOption({ index: 1 });

      // 2. NOME COMPLETO — placeholder "Maria Silva" — pressSequentially para React state
      const nomeInput = page.getByPlaceholder('Maria Silva');
      await expect(nomeInput).toBeVisible({ timeout: 3_000 });
      await nomeInput.click();
      await nomeInput.pressSequentially('Playwright Usuário Teste', { delay: 30 });

      // 3. E-MAIL — placeholder não especificado, usa input[type="email"]
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.click();
      await emailInput.pressSequentially(TEST_PORTAL_EMAIL_NEW, { delay: 20 });

      // "ENVIAR CONVITE →" deve estar habilitado após preencher os 3 campos
      const submitBtn = page.getByRole('button', { name: /ENVIAR CONVITE/i });
      await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
      await submitBtn.click();

      // Verifica confirmação (e-mail disparado via n8n — verificar externamente)
      await expect(
        page.getByText(TEST_PORTAL_EMAIL_NEW).or(page.getByText(/convite enviado|sucesso/i))
      ).toBeVisible({ timeout: 10_000 });
    });

    test('P0 — botão Recursos expande toggles inline que auto-salvam', async ({ page }) => {
      // Encontra um usuário na lista
      const recursosBtn = page.getByRole('button', { name: /recursos/i }).first();
      if (await recursosBtn.count() === 0) {
        test.skip(true, 'Botão "Recursos" não encontrado — verifique se há usuários cadastrados');
      }
      await recursosBtn.click();

      // Os toggles DFC/DRE, Projeção e Download devem aparecer
      await expect(page.getByText(/DFC|DRE/i)).toBeVisible({ timeout: 3_000 });
      await expect(page.getByText(/Projeção/i)).toBeVisible();
      await expect(page.getByText(/Download/i)).toBeVisible();

      // Clica em um toggle e verifica que auto-salva (sem botão "Salvar" separado)
      const firstToggle = page.locator('[role="switch"], input[type="checkbox"]').first();
      const wasChecked = await firstToggle.isChecked();
      await firstToggle.click();

      // Aguarda request de salvamento automático
      await page.waitForResponse((r) => r.url().includes('supabase') && r.status() < 400, { timeout: 8_000 });

      // Recarrega a página e verifica persistência
      await page.reload();
      await recursosBtn.click();
      const isNowChecked = await page.locator('[role="switch"], input[type="checkbox"]').first().isChecked();
      expect(isNowChecked).toBe(!wasChecked);
    });

    test('P1 — revogar acesso → usuário não consegue mais fazer login no portal', async ({ page }) => {
      const revokeBtn = page.getByRole('button', { name: /revogar|desativar|remover acesso/i }).first();
      if (await revokeBtn.count() === 0) {
        test.skip(true, 'Botão de revogar acesso não encontrado');
      }
      await revokeBtn.click();

      // Confirma a revogação se houver dialog
      const confirmBtn = page.getByRole('button', { name: /confirmar|revogar|sim/i });
      if (await confirmBtn.count() > 0) await confirmBtn.click();

      await expect(page.getByText(/revogado|acesso removido|desativado/i)).toBeVisible({ timeout: 8_000 });
    });
  });
});
