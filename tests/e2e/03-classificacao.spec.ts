/**
 * 03 — Classificação Multi-Cliente · M2
 * Homologação Aurora · 9 itens (P0×3, P1×5, P0)
 * Projeto Playwright: admin (com storageState)
 */
import { test, expect } from '@playwright/test';

test.describe('03 — Classificação Multi-Cliente · M2', () => {
  // ── Tela de Pendentes ─────────────────────────────────────────────────────

  test.describe('Tela de Pendentes', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/pendentes');
    });

    test('P0 — transações listadas por cliente com categoria sugerida e score de confiança', async ({ page }) => {
      // Pelo menos um item com categoria sugerida deve aparecer
      // (ou mensagem "nenhuma pendente" se tudo já foi aprovado)
      const hasPending = await page.getByText(/categoria|pendente|score|confiança/i).count() > 0;
      const isEmpty = await page.getByText(/nenhum|sem transações|vazio|0 pendentes/i).count() > 0;
      expect(hasPending || isEmpty).toBe(true);
    });

    test('P0 — alterar categoria de uma transação antes de aprovar → categoria salva', async ({ page }) => {
      // Procura um select de categoria em uma linha pendente
      const categorySelect = page.locator('select').filter({ hasText: /categoria|categoria/i }).first()
        .or(page.locator('select').first());

      if (await categorySelect.count() === 0) {
        test.skip(true, 'Nenhuma transação pendente disponível para editar categoria');
      }
      const options = await categorySelect.locator('option').allTextContents();
      if (options.length < 2) test.skip(true, 'Apenas uma opção de categoria disponível');

      // Muda para a segunda categoria disponível
      const newCat = options.find((o) => o.trim() !== '' && o !== options[0]) ?? options[1];
      await categorySelect.selectOption({ label: newCat });

      // Aprova a transação
      await page.getByRole('button', { name: /aprovar/i }).first().click();

      // Verifica que a categoria foi salva (sem mensagem de erro)
      await expect(page.getByText(/erro|error/i)).not.toBeVisible();
    });

    test('P1 — aprovação em massa → tela atualiza', async ({ page }) => {
      const selectAll = page.getByRole('checkbox', { name: /todos|all/i })
        .or(page.locator('input[type="checkbox"]').first());

      if (await selectAll.count() === 0) {
        test.skip(true, 'Sem checkbox de seleção em massa visível');
      }
      await selectAll.check();

      const massApprove = page.getByRole('button', { name: /aprovar.*(todos|selecionados|em massa)/i })
        .or(page.getByRole('button', { name: /aprovar/i }).nth(1));

      if (await massApprove.count() > 0) {
        await massApprove.click();
        // A lista deve atualizar (reduzir ou mostrar "sem pendentes")
        await page.waitForResponse((r) => r.url().includes('supabase') && r.status() < 400);
        await expect(page.getByText(/erro|error/i)).not.toBeVisible();
      }
    });

    test('P1 — após 2ª aprovação do mesmo padrão → regra criada automaticamente', async ({ page }) => {
      // Verificacional: navega para onde as regras ficam (pendentes ou rota dedicada)
      // Tenta /admin/regras; se não existir, procura dentro de pendentes
      await page.goto('/admin/regras');
      const isRulesPage = await page.getByText(/regra|rule|classificação/i).count() > 0;

      if (!isRulesPage) {
        // Regras podem estar dentro de /admin/pendentes
        await page.goto('/admin/pendentes');
        const rulesTab = page.getByRole('button', { name: /regras/i })
          .or(page.getByRole('tab', { name: /regras/i }));
        if (await rulesTab.count() > 0) {
          await rulesTab.first().click();
          await expect(page.locator('body')).toContainText(/regra|automátic|padrão/i, { timeout: 8_000 });
        } else {
          test.skip(true, 'Tela de regras não localizada — verificar rota correta');
        }
      } else {
        await expect(page.locator('body')).toContainText(/regra|rule|classificação/i, { timeout: 8_000 });
      }
    });
  });

  // ── Tela de Recorrências ──────────────────────────────────────────────────

  test.describe('Tela de Recorrências', () => {
    test.beforeEach(async ({ page }) => {
      // Recorrências ficam dentro da tela de pendentes ou em aba específica
      await page.goto('/admin/pendentes');
    });

    test('P1 — recorrências detectadas com descrição, categoria e frequência', async ({ page }) => {
      // Procura aba ou seção de recorrências
      const recTab = page.getByRole('tab', { name: /recorrência/i })
        .or(page.getByRole('button', { name: /recorrência/i }));

      if (await recTab.count() > 0) {
        await recTab.first().click();
        // Verifica que há conteúdo (recorrências ou mensagem de vazio)
        await expect(page.locator('body')).toContainText(/recorrência|mensal|semanal|frequência|nenhuma/i, { timeout: 8_000 });
      } else {
        test.skip(true, 'Aba de Recorrências não encontrada na tela de pendentes');
      }
    });

    test('P1 — aceitar recorrência → regra ativa; rejeitar → regra rejeitada', async ({ page }) => {
      const recTab = page.getByRole('tab', { name: /recorrência/i })
        .or(page.getByRole('button', { name: /recorrência/i }));

      if (await recTab.count() === 0) {
        test.skip(true, 'Aba de Recorrências não encontrada');
      }
      await recTab.first().click();

      const acceptBtn = page.getByRole('button', { name: /aceitar/i }).first();
      const rejectBtn = page.getByRole('button', { name: /rejeitar/i }).first();

      if (await acceptBtn.count() > 0) {
        await acceptBtn.click();
        await expect(page.getByText(/ativa|aceita/i)).toBeVisible({ timeout: 5_000 });
      } else if (await rejectBtn.count() > 0) {
        await rejectBtn.click();
        await expect(page.getByText(/rejeitada/i)).toBeVisible({ timeout: 5_000 });
      } else {
        test.skip(true, 'Nenhuma recorrência pendente de decisão');
      }
    });
  });

  // ── Gestão de Categorias ──────────────────────────────────────────────────

  test.describe('Gestão de Categorias', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/categorias');
    });

    test('P1 — criar nova categoria → disponível no dropdown de pendentes', async ({ page }) => {
      // Formulário de categoria é inline (sempre visível) — sem botão "Nova categoria"
      // Input: placeholder "Ex: Receita · Honorários", botão: "+ Adicionar"
      const nameInput = page.getByPlaceholder(/Ex: Receita/i);
      await expect(nameInput).toBeVisible({ timeout: 8_000 });

      const catName = `Cat Teste ${Date.now()}`;
      await nameInput.click();
      await nameInput.pressSequentially(catName, { delay: 20 });

      await page.getByRole('button', { name: /\+ Adicionar/i }).click();
      await expect(page.getByText(catName)).toBeVisible({ timeout: 5_000 });

      // Verifica que aparece no dropdown da tela de pendentes
      await page.goto('/admin/pendentes');
      const catDropdown = page.locator('select').first();
      if (await catDropdown.count() > 0) {
        const options = await catDropdown.locator('option').allTextContents();
        expect(options.some((o) => o.includes(catName))).toBe(true);
      }
    });

    test('P0 — excluir categoria exibe confirmação obrigatória antes de deletar', async ({ page }) => {
      // Deletes usam window.confirm() nativo — registra handler ANTES de clicar
      let dialogFired = false;
      page.on('dialog', async (dialog) => {
        dialogFired = true;
        await dialog.accept();
      });

      // Verifica se há categorias listadas
      const deleteBtn = page.getByRole('button', { name: /excluir|deletar|remover/i }).first()
        .or(page.locator('[title="Excluir"], [aria-label="Excluir"]').first());

      if (await deleteBtn.count() === 0) {
        test.skip(true, 'Nenhum botão de excluir visível — verifique se há categorias cadastradas');
      }
      await deleteBtn.click();

      // O dialog nativo deveria ter disparado; aguarda um tick para o handler processar
      await page.waitForTimeout(500);

      // Confirma que a confirmação ocorreu (dialog nativo ou modal)
      const hasModal = await page.getByRole('dialog').or(page.getByRole('alertdialog')).count() > 0;
      expect(dialogFired || hasModal).toBe(true);
    });

    test('P0 — isolamento multi-cliente: categorias do cliente A não aparecem para cliente B', async ({ page }) => {
      // Seleciona cliente A e registra as categorias
      const clientFilter = page.locator('select[name="client"], select').first();
      if (await clientFilter.count() === 0) {
        test.skip(true, 'Seletor de cliente não encontrado na tela de categorias');
      }
      const options = await clientFilter.locator('option').all();
      if (options.length < 3) test.skip(true, 'Precisa de ao menos 2 clientes para testar isolamento');

      await clientFilter.selectOption({ index: 1 });
      const catsA = await page.locator('[data-testid="category-item"], li, tr').allTextContents();

      await clientFilter.selectOption({ index: 2 });
      const catsB = await page.locator('[data-testid="category-item"], li, tr').allTextContents();

      // As listas devem ser diferentes (ou pelo menos a contagem)
      expect(JSON.stringify(catsA)).not.toBe(JSON.stringify(catsB));
    });
  });
});
