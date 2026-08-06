import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env.test sem depender do pacote dotenv
function loadEnvFile(filepath: string) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    // remove aspas opcionais e colchetes angulares de placeholder (<valor>)
    const val = raw.replace(/^(['"])(.*)\1$/, '$2').replace(/^<(.*)>$/, '$1');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(__dirname, '.env.test'));

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'tests/e2e/reports', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    // Roda primeiro: salva estados de autenticação
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Testes admin (usa estado salvo pelo setup)
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: ['**/01-auth.spec.ts', '**/06-portal.spec.ts', '**/10-landing.spec.ts'],
    },
    // Testes do portal do cliente
    {
      name: 'portal',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/portal.json',
      },
      dependencies: ['setup'],
      testMatch: ['**/06-portal.spec.ts'],
    },
    // Testes públicos (sem autenticação prévia)
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/01-auth.spec.ts', '**/10-landing.spec.ts'],
    },
  ],
  // Sem webServer — app roda no Lovable Cloud, não localmente.
  // Configure APP_URL no .env.test com a URL do deploy (ex: https://xxx.lovable.app)
});
