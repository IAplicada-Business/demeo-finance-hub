import { Page } from '@playwright/test';

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  // Aba "Gestora (Claudia)" é o default
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 10_000 });
}

export async function loginAsPortal(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Cliente' }).click();
  await page.locator('input[type="email"]').fill(process.env.TEST_PORTAL_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_PORTAL_PASSWORD!);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL(/\/portal/, { timeout: 10_000 });
}

export async function logout(page: Page) {
  // Abre menu do usuário (botão no header que contém "Gestora")
  await page.locator('header').getByRole('button').filter({ hasText: 'Gestora' }).click();
  // "Sair" é um <Link to="/login"> — navega sem chamar signOut()
  await page.getByText('Sair').click();
  await page.waitForURL(/\/login/, { timeout: 8_000 });
}
