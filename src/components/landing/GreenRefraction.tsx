// Assinatura visual Aurora — abstrato com "refraction" verde+sage
// Substitui o green-glass-photo do Podcast Coach por composição SVG
// proprietária com Cormorant Garamond + paleta Aurora.
export function GreenRefraction({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true" style={{ position: "relative" }}>
      <svg viewBox="0 0 600 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="aurora-refr-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A6741" />
            <stop offset="60%" stopColor="#3D5636" />
            <stop offset="100%" stopColor="#1B394D" />
          </linearGradient>
          <linearGradient id="aurora-refr-2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8FA688" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#4A6741" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="aurora-refr-3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#99A989" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6D92A6" stopOpacity="0.25" />
          </linearGradient>
          <filter id="aurora-refr-blur">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* Base solid */}
        <rect x="0" y="0" width="600" height="720" fill="url(#aurora-refr-1)" />

        {/* Brilho de luz superior — efeito glass */}
        <path
          d="M0,0 L600,0 L600,420 Q420,360 300,400 Q150,440 0,380 Z"
          fill="rgba(255,255,255,0.06)"
        />

        {/* Linha diagonal de luz */}
        <path
          d="M0,500 Q200,360 600,440"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />
        <path
          d="M0,560 Q280,400 600,500"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {/* Bloom sage */}
        <ellipse
          cx="180"
          cy="240"
          rx="220"
          ry="160"
          fill="url(#aurora-refr-2)"
          filter="url(#aurora-refr-blur)"
        />

        {/* Bloom tan no canto inferior */}
        <ellipse
          cx="500"
          cy="640"
          rx="180"
          ry="140"
          fill="url(#aurora-refr-3)"
          filter="url(#aurora-refr-blur)"
        />

        {/* Símbolo Aurora gigante (3 arcos + ponto âncora) */}
        <g
          transform="translate(300, 460)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        >
          <path d="M-110,0 A110,110 0 0 1 110,0" />
          <path d="M-80,0 A80,80 0 0 1 80,0" opacity="0.7" />
          <path d="M-48,0 A48,48 0 0 1 48,0" opacity="0.45" />
          <circle cx="0" cy="0" r="4" fill="rgba(255,255,255,0.55)" />
        </g>

        {/* Cormorant grande italic 'Aurora' embutido */}
        <text
          x="300"
          y="640"
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', serif"
          fontStyle="italic"
          fontWeight="300"
          fontSize="80"
          fill="rgba(255,255,255,0.08)"
          letterSpacing="-2"
        >
          Aurora
        </text>
      </svg>
    </div>
  );
}
