# Atualização Visual — Proposta e Contrato (PDF)

## O que precisa ser feito

Atualizar o visual dos PDFs gerados pelo sistema (Proposta e Contrato) aplicando o novo design dos arquivos HTML de referência em anexo.

**Importante:** os PDFs **não** são renderizados a partir de templates HTML. A geração é feita programaticamente com `pdf-lib` nas Edge Functions:

- `supabase/functions/proposal-generate/index.ts` → Proposta
- `supabase/functions/contract-generate/index.ts` → Contrato

Os arquivos HTML abaixo são **referência visual** (CSS, tipografia, layout, cores). Use-os como fonte de verdade para **replicar o design no código pdf-lib**:

- `AURORA-CTR-2026-0005-redesign.html` → referência do Contrato
- `AURORA-2026-0008-redesign.html` → referência da Proposta

## O que mudar

Porte o design dos HTMLs de referência para as funções `proposal-generate` e `contract-generate`, ajustando coordenadas, fontes, cores (`rgb(...)`), blocos e espaçamentos no código pdf-lib. Mantenha toda a lógica de dados dinâmicos já implementada (variáveis, loops, campos do banco).

**Não altere:**
- Endpoints e contratos das Edge Functions
- Campos dinâmicos e mapeamento com o banco
- Fluxo de envio (`proposal-send`, `contract-send`) nem integração n8n

**Substitua / atualize nas Edge Functions:**
- Paleta de cores (constantes `rgb(...)` no topo de cada função)
- Layout de cabeçalho, seções, tabelas e rodapé
- Tipografia e hierarquia visual conforme a referência HTML
- Layout das cláusulas/seções em duas colunas onde aplicável

**Não tente:** substituir CSS/HTML dentro das Edge Functions — elas não usam templates HTML.

## Identidade visual aplicada

| Token | Hex | Uso |
|---|---|---|
| Linho | `#F7F1E8` | Fundos de seção |
| Verde De Meo | `#4A6741` | Acentos, marcadores, bordas ativas |
| Prussian Blue | `#1B394D` | Títulos e dados |
| Sálvia | `#8FA688` | Textos secundários |
| Biscoito | `#D4B896` | Divisores e bordas |
| Âmbar | `#B8956A` | Destaques (ex: valor da mensalidade) |

Fontes: `Cormorant Garamond` weight 300/italic para display · `Jost` weight 300/400/500 para interface (em pdf-lib, usar fontes embutidas ou StandardFonts equivalentes).

## Observação

Os documentos são fluidos (sem páginas fixas) e responsivos ao conteúdo — o layout cresce com o texto. Replique esse comportamento com quebra de página dinâmica no pdf-lib (já parcialmente implementado). Os HTMLs de referência servem para validação visual no navegador e impressão; o PDF entregue ao cliente vem exclusivamente das Edge Functions.
