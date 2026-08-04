// Seção "Casos" — 4 cards image-heavy estilo Podcast Coach, mas com
// composições SVG abstratas no lugar de fotos (cada caso ganha um "asset"
// visual proprietário). Substitui o bento grid antigo.

type Case = {
  cap: string;
  company: string;
  pain: string;
  result: string;
  asset: "padaria" | "restaurante" | "consultorio" | "escritorio";
};

const CASES: Case[] = [
  {
    cap: "Alimentação · São Paulo",
    company: "Padaria São Jorge",
    pain: "Vendia bem mas não sabia onde sobrava",
    result: "Margem real subiu de 4% para 11% em 4 meses",
    asset: "padaria",
  },
  {
    cap: "Restaurante · Belo Horizonte",
    company: "Pernambuco Cozinha de Bairro",
    pain: "Planilha confusa, decisão por instinto",
    result: "DFC fechado todo mês — apertou folha sem desespero",
    asset: "restaurante",
  },
  {
    cap: "Saúde · Porto Alegre",
    company: "Consultório Dra. Ana",
    pain: "Misturava finanças PJ com PF",
    result: "Tirou pró-labore organizado e separou caixas",
    asset: "consultorio",
  },
  {
    cap: "Serviços · Curitiba",
    company: "Escritório Lima & Silva",
    pain: "Crescimento sem controle de fluxo",
    result: "Projeção 90d antecipou aperto e salvou 3 contratações",
    asset: "escritorio",
  },
];

export function CaseStudies() {
  return (
    <section
      className="px-6 lg:px-14 py-28 lg:py-36 relative"
      style={{ background: "var(--navy)", color: "#fff" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <div className="reveal grid md:grid-cols-[1fr_1fr] gap-8 items-end mb-14">
          <div>
            <div
              className="text-[10px] uppercase mb-4"
              style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 600 }}
            >
              [ 02 — Casos ]
            </div>
            <h2
              className="aurora-serif"
              style={{
                fontSize: "clamp(40px, 5vw, 64px)",
                fontWeight: 300,
                lineHeight: 1,
                letterSpacing: "-2px",
                color: "#fff",
              }}
            >
              Empresas{" "}
              <em className="italic" style={{ color: "var(--sage)" }}>
                que crescem
              </em>{" "}
              com leitura clara.
            </h2>
          </div>
          <p
            style={{
              fontSize: 15,
              fontWeight: 300,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.7)",
              maxWidth: 460,
            }}
          >
            Quatro recortes de carteira atual. Cada um começou no mesmo lugar — sem saber para onde
            o dinheiro ia. Hoje decidem com a foto inteira na mão.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CASES.map((c, i) => (
            <article
              key={c.company}
              className="reveal flex flex-col"
              style={{
                background: "#FFFFFF",
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <CaseAsset variant={c.asset} />
              <div className="p-7 flex flex-col gap-4">
                <div
                  className="text-[9px] uppercase"
                  style={{ letterSpacing: "2.5px", color: "var(--sage)", fontWeight: 600 }}
                >
                  {c.cap}
                </div>
                <h3
                  className="aurora-serif"
                  style={{
                    fontSize: 22,
                    fontWeight: 300,
                    letterSpacing: "-0.5px",
                    color: "var(--navy)",
                    lineHeight: 1.2,
                  }}
                >
                  {c.company}
                </h3>
                <div
                  className="text-[12px] uppercase"
                  style={{
                    letterSpacing: "1.5px",
                    color: "var(--muted-foreground)",
                    fontWeight: 500,
                  }}
                >
                  Dor inicial
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--foreground)",
                    lineHeight: 1.55,
                    marginTop: -4,
                  }}
                >
                  {c.pain}
                </p>
                <div
                  className="text-[12px] uppercase"
                  style={{ letterSpacing: "1.5px", color: "var(--green)", fontWeight: 500 }}
                >
                  Resultado
                </div>
                <p
                  className="aurora-serif italic"
                  style={{
                    fontSize: 18,
                    color: "var(--green)",
                    lineHeight: 1.4,
                    letterSpacing: "-0.3px",
                    marginTop: -4,
                  }}
                >
                  {c.result}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseAsset({ variant }: { variant: Case["asset"] }) {
  // Cada caso ganha uma "fotografia" SVG abstrata com paleta Aurora e
  // referência visual ao segmento.
  const common = { width: "100%", height: "100%", style: { display: "block" } };
  return (
    <div
      style={{
        aspectRatio: "4 / 3",
        background: "var(--linen2)",
        borderBottom: "1px solid var(--line)",
        position: "relative",
        overflow: "hidden",
      }}
      aria-hidden
    >
      {variant === "padaria" && (
        <svg viewBox="0 0 400 300" {...common}>
          <rect width="400" height="300" fill="#E0E4D6" />
          {/* Pão estilizado */}
          <ellipse cx="200" cy="220" rx="160" ry="50" fill="#6D92A6" opacity="0.4" />
          <path d="M40,220 Q60,140 130,130 Q200,120 270,135 Q340,150 360,220 Z" fill="#99A989" />
          {/* Linhas do pão */}
          {[0.3, 0.45, 0.6, 0.75].map((t) => (
            <path
              key={t}
              d={`M${60 + 280 * t * 0.2},${190 - 30 * Math.sin(t * Math.PI)} Q${130 + 140 * t * 0.3},${130 + 30 * t} ${260 - 100 * t * 0.2},${190 - 30 * Math.sin((1 - t) * Math.PI)}`}
              stroke="#4A6B55"
              strokeWidth="1.5"
              fill="none"
              opacity="0.5"
            />
          ))}
          {/* Vapor */}
          <path
            d="M150,90 Q145,75 155,60 Q160,45 150,30"
            stroke="#4A6741"
            strokeWidth="2"
            fill="none"
            opacity="0.35"
            strokeLinecap="round"
          />
          <path
            d="M200,80 Q205,60 195,45 Q190,30 205,18"
            stroke="#4A6741"
            strokeWidth="2"
            fill="none"
            opacity="0.45"
            strokeLinecap="round"
          />
          <path
            d="M250,90 Q245,75 255,60 Q260,45 250,30"
            stroke="#4A6741"
            strokeWidth="2"
            fill="none"
            opacity="0.35"
            strokeLinecap="round"
          />
        </svg>
      )}
      {variant === "restaurante" && (
        <svg viewBox="0 0 400 300" {...common}>
          <rect width="400" height="300" fill="#1B394D" />
          {/* Prato */}
          <ellipse cx="200" cy="210" rx="120" ry="20" fill="#0F2535" opacity="0.5" />
          <circle cx="200" cy="180" r="90" fill="#FAFBFA" />
          <circle cx="200" cy="180" r="76" fill="#E0E4D6" />
          {/* Comida estilizada */}
          <circle cx="180" cy="160" r="24" fill="#4A6741" opacity="0.85" />
          <circle cx="220" cy="180" r="20" fill="#6D92A6" />
          <circle cx="200" cy="200" r="18" fill="#99A989" opacity="0.85" />
          {/* Garfo e faca abstratos */}
          <line
            x1="80"
            y1="80"
            x2="100"
            y2="240"
            stroke="#8FA688"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.5"
          />
          <line
            x1="320"
            y1="80"
            x2="300"
            y2="240"
            stroke="#8FA688"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      )}
      {variant === "consultorio" && (
        <svg viewBox="0 0 400 300" {...common}>
          <rect width="400" height="300" fill="#E0E4D6" />
          {/* Caduceus abstrato — duas linhas se cruzando */}
          <line
            x1="200"
            y1="40"
            x2="200"
            y2="260"
            stroke="#4A6741"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M170,80 Q200,110 230,140 Q200,170 170,200 Q200,230 230,260"
            stroke="#8FA688"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M230,80 Q200,110 170,140 Q200,170 230,200 Q200,230 170,260"
            stroke="#8FA688"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          {/* Asas */}
          <path
            d="M200,60 Q150,80 130,40 M200,60 Q250,80 270,40"
            stroke="#4A6741"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* Círculo de fundo */}
          <circle cx="200" cy="150" r="120" fill="#4A6741" opacity="0.06" />
        </svg>
      )}
      {variant === "escritorio" && (
        <svg viewBox="0 0 400 300" {...common}>
          <rect width="400" height="300" fill="#FAFBFA" />
          {/* Skyline de prédios */}
          <rect x="60" y="100" width="40" height="180" fill="#1B394D" opacity="0.85" />
          <rect x="110" y="60" width="50" height="220" fill="#1B394D" />
          <rect x="170" y="120" width="36" height="160" fill="#1B394D" opacity="0.85" />
          <rect x="215" y="80" width="60" height="200" fill="#1B394D" />
          <rect x="285" y="140" width="44" height="140" fill="#1B394D" opacity="0.85" />
          {/* Janelas iluminadas */}
          {Array.from({ length: 8 }).map((_, i) => (
            <rect
              key={i}
              x={120 + (i % 4) * 10}
              y={80 + Math.floor(i / 4) * 60}
              width="4"
              height="6"
              fill="#99A989"
            />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <rect
              key={`b-${i}`}
              x={225 + (i % 4) * 12}
              y={100 + Math.floor(i / 4) * 50}
              width="5"
              height="7"
              fill="#99A989"
              opacity="0.8"
            />
          ))}
          {/* Linha verde — gráfico em alta no skyline */}
          <path
            d="M30,200 Q100,170 200,150 Q280,135 370,90"
            stroke="#4A6741"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="370" cy="90" r="5" fill="#4A6741" />
        </svg>
      )}
    </div>
  );
}
