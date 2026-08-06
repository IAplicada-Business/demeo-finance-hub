# Fixtures para os testes E2E

Esta pasta é ignorada pelo git. Coloque aqui os arquivos de extrato antes de rodar
os testes das seções 02 e 11.

## Arquivos recomendados (já incluídos localmente)

| Arquivo                   | Banco | Período   | Seção  | Prioridade |
|---------------------------|-------|-----------|--------|------------|
| inter-sample-2024-02.png  | Inter | 2024-02   | 02, 11 | P0 (preferido) |
| citi-sample-2010-04.jpg   | Citi  | 2010-04   | 02     | P0         |
| itau-sample.pdf           | Itaú  | (inferido)| 02, 11 | fallback   |

Formatos aceitos pelo app: **PDF, CSV, XLSX, PNG, JPG**.

## Arquivos opcionais

| Arquivo             | Banco     | Seção | Prioridade |
|---------------------|-----------|-------|------------|
| bradesco-sample.pdf | Bradesco  | 02    | P0         |
| santander-sample.pdf| Santander | 02    | P0         |
| itau-sample.csv     | Itaú      | 02    | P1         |
| inter-sample.csv    | Inter     | 02    | P1         |

## Como obter

Use extratos reais (anonimizados se necessário) de contas de teste.
Os arquivos devem ser **extratos bancários** — não comprovantes avulsos.

Os testes usam `primaryImportFixture()` e fazem `test.skip` automaticamente
se nenhum arquivo for encontrado.

**Privacidade:** mantenha CPF/nomes sensíveis apenas nesta pasta gitignored.
