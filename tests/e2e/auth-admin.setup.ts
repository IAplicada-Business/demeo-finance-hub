import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_STATE = 'tests/e2e/.auth/admin.json';

const authDir = path.resolve(__dirname, '.auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

setup('salvar estado de autenticação — admin', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});
