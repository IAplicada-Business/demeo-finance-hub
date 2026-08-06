import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_STATE = 'tests/e2e/.auth/admin.json';
const PORTAL_STATE = 'tests/e2e/.auth/portal.json';

// Garante que a pasta .auth existe antes de salvar os estados
const authDir = path.resolve(__dirname, '.auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

setup('salvar estado de autenticação — admin', async ({ page }) => {
  await page.goto('/login');
  // A aba "Gestora (Claudia)" é o default
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('salvar estado de autenticação — portal', async ({ page }) => {
  await page.goto('/login');
  // Troca para a aba "Cliente"
  await page.getByRole('button', { name: 'Cliente' }).click();
  await page.locator('input[type="email"]').fill(process.env.TEST_PORTAL_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_PORTAL_PASSWORD!);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await expect(page).toHaveURL(/\/portal/, { timeout: 10_000 });
  await page.context().storageState({ path: PORTAL_STATE });
});
