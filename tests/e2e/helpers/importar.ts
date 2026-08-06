import { expect, type Page } from '@playwright/test';

function testClientId(): string {
  const id = process.env.TEST_CLIENT_ID;
  if (!id) {
    throw new Error('TEST_CLIENT_ID não definido em .env.test');
  }
  return id;
}

/** Modal de confirmação pós-seleção de arquivo(s). */
export function importConfirmModal(page: Page) {
  return page.locator('.aurora-modal').filter({ hasText: /importar extrato/i });
}

export async function waitForImportConfirmModal(page: Page) {
  const identifying = page.getByText(/identificando cliente e período com ia/i);
  if (await identifying.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await expect(identifying).not.toBeVisible({ timeout: 120_000 });
  }
  await expect(importConfirmModal(page)).toBeVisible({ timeout: 120_000 });
}

export async function uploadFilesForImport(page: Page, filePaths: string | string[]) {
  const identifyDone = page
    .waitForResponse(
      (r) => r.url().includes('parse-extract') && r.request().method() === 'POST',
      { timeout: 120_000 },
    )
    .catch(() => null);

  await page.locator('input[type="file"]').setInputFiles(filePaths);
  await waitForImportConfirmModal(page);
  await identifyDone;
}

export async function waitForClientOptions(page: Page, rowIndex: number) {
  await page.waitForFunction(
    (idx) => {
      const selects = document.querySelectorAll('.aurora-modal table tbody select');
      const s = selects[idx] as HTMLSelectElement | undefined;
      return s ? Array.from(s.options).some((o) => o.value.length > 10) : false;
    },
    rowIndex,
    { timeout: 30_000 },
  );
}

async function setImportModalClient(
  page: Page,
  rowIndex: number,
  clientId: string,
) {
  const modal = importConfirmModal(page);
  const select = modal.locator('table tbody select').nth(rowIndex);

  await expect(select).toBeVisible();
  await waitForClientOptions(page, rowIndex);

  await select.selectOption(clientId);

  const synced = await page
    .waitForFunction(
      ({ idx, id }) => {
        const selects = document.querySelectorAll('.aurora-modal table tbody select');
        const s = selects[idx] as HTMLSelectElement | undefined;
        return s?.value === id;
      },
      { idx: rowIndex, id: clientId },
      { timeout: 4_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!synced) {
    await select.evaluate((el, id) => {
      const sel = el as HTMLSelectElement;
      sel.value = id;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, clientId);
  }

  await expect(select).toHaveValue(clientId, { timeout: 10_000 });
}

async function ensureImportModalPeriod(page: Page, rowIndex: number, periodIso?: string) {
  const modal = importConfirmModal(page);
  const monthInput = modal.locator('input[type="month"]').nth(rowIndex);
  let target = periodIso ?? (await monthInput.inputValue());
  if (!target) {
    const now = new Date();
    target = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  if ((await monthInput.inputValue()) !== target) {
    await monthInput.fill(target);
    await monthInput.dispatchEvent('change');
  }
  await expect(monthInput).toHaveValue(target);
}

/** Garante cliente e período preenchidos na linha do modal. */
export async function ensureImportModalReady(
  page: Page,
  opts: { clientId?: string; clientName?: string; rowIndex?: number; periodIso?: string } = {},
) {
  const rowIndex = opts.rowIndex ?? 0;
  let clientId = opts.clientId ?? testClientId();

  if (opts.clientName && !opts.clientId) {
    const modal = importConfirmModal(page);
    const select = modal.locator('table tbody select').nth(rowIndex);
    await waitForClientOptions(page, rowIndex);
    const match = select.locator('option').filter({ hasText: new RegExp(`^${opts.clientName}$`, 'i') });
    if ((await match.count()) > 0) {
      clientId = (await match.first().getAttribute('value')) ?? clientId;
    }
  }

  await setImportModalClient(page, rowIndex, clientId);
  await ensureImportModalPeriod(page, rowIndex, opts.periodIso);

  const confirmBtn = importConfirmModal(page).getByRole('button', {
    name: /confirmar importação|importar \d+ extratos/i,
  });
  await expect(confirmBtn).toBeEnabled({ timeout: 20_000 });
}

export async function selectClientInImportModal(
  page: Page,
  opts: { clientId?: string; clientName?: string; rowIndex?: number; periodIso?: string } = {},
) {
  await ensureImportModalReady(page, opts);
}

export async function confirmImportInModal(page: Page) {
  const modal = importConfirmModal(page);
  const confirmBtn = modal.getByRole('button', {
    name: /confirmar importação|importar \d+ extratos/i,
  });
  await expect(confirmBtn).toBeEnabled({ timeout: 15_000 });
  await confirmBtn.click();
  await expect(modal).not.toBeVisible({ timeout: 15_000 });
}

/** Upload → escolhe cliente no modal → confirma importação. */
export async function uploadAndConfirmImport(
  page: Page,
  filePaths: string | string[],
  opts: { periodIso?: string; clientName?: string } = {},
) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  await uploadFilesForImport(page, filePaths);

  for (let i = 0; i < paths.length; i++) {
    await ensureImportModalReady(page, {
      clientName: opts.clientName ?? 'Teste',
      periodIso: opts.periodIso,
      rowIndex: i,
    });
  }

  await confirmImportInModal(page);
}

export async function waitForImportClassification(page: Page) {
  const main = page.locator('main');
  const loadingMsg = main.getByText(/classificando com ia|lendo arquivo/i);
  await expect(loadingMsg).toBeVisible({ timeout: 30_000 });
  await expect(loadingMsg).not.toBeVisible({ timeout: 120_000 });
}

export async function waitForImportResultOrDuplicate(page: Page) {
  await waitForImportClassification(page);

  const duplicateMsg = page.getByText(/todos já existem no sistema/i);
  if (await duplicateMsg.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return 'duplicate' as const;
  }

  await expect(page.locator('main').getByText(/\d+ lançamentos/i)).toBeVisible({ timeout: 30_000 });
  return 'result' as const;
}
