# Fixtures para os testes E2E

Esta pasta é ignorada pelo git. Coloque aqui os arquivos de extrato reais
antes de rodar os testes das seções 02 e 11.

## Arquivos necessários

| Arquivo            | Banco    | Seção   | Prioridade |
|--------------------|----------|---------|------------|
| itau-sample.pdf    | Itaú     | 02, 11  | P0         |
| bradesco-sample.pdf| Bradesco | 02      | P0         |
| santander-sample.pdf| Santander| 02     | P0         |
| itau-sample.csv    | Itaú     | 02      | P1         |
| inter-sample.csv   | Inter    | 02      | P1         |

## Como obter

Use extratos reais (anonimizados se necessário) de contas de teste.
Os PDFs devem ser do tipo "extrato bancário" — não comprovantes de pagamento.

Os testes que dependem dessas fixtures usam `test.skip` automaticamente
se o arquivo não for encontrado.
