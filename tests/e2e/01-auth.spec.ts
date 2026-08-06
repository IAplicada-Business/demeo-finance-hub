/**
 * 01 — Autenticação & Sessão
 * Homologação Aurora · 4 itens (P0, P0, P1, P0)
 * Projeto Playwright: public (sem storageState)
 *
 * NOTA: "Sair" no AdminLayout é <Link to="/login"> sem signOut().
 * O P1 (logout) verifica apenas que a navegação para /login ocorre.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, logout } from './helpers/login';

test.describe('01 — Autenticação & Sessão', () => {
  test('P0 — login com e-mail e senha válidos redireciona para /admin/', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /Entrar/ }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 12_000 });
  });

  test('P0 — sessão persiste após F5 → admin continua logado', async ({ page }) => {
    await loginAsAdmin(page);
    // Aguarda a página carregar — Dashboard aparece em 2 elementos (sidebar + header), usa .first()
    await expect(page.getByText('Dashboard', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await page.reload();
    // TanStack Router re-verifica sessão no Supabase — aguarda um pouco mais
    await expect(page).toHaveURL(/\/admin/, { timeout: 12_000 });
  });

  test('P1 — "Sair" navega para /login (nota: signOut não é chamado no admin)', async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('P0 — acesso direto a /admin/ sem sessão redireciona para /login', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
