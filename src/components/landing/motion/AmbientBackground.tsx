// Background ambient — branco com blobs orgânicos animados e símbolo Aurora.
// Substitui qualquer fundo bege.
import { LogoMark } from "@/components/Logo";

export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1, overflow: "hidden" }}
    >
      <div className="absolute" style={{ inset: 0, background: "#FFFFFF" }} />

      {/* Blob 1 — sage (sutil) */}
      <div
        className="absolute"
        style={{
          left: "-10%",
          top: "5%",
          width: 760,
          height: 760,
          background: "radial-gradient(circle, rgba(153,169,137,0.18) 0%, transparent 60%)",
          filter: "blur(60px)",
          borderRadius: "50%",
          animation: "ambient-drift-1 28s ease-in-out infinite",
        }}
      />
      {/* Blob 2 — steel (sutil) */}
      <div
        className="absolute"
        style={{
          right: "-15%",
          top: "30%",
          width: 820,
          height: 820,
          background: "radial-gradient(circle, rgba(109,146,166,0.14) 0%, transparent 60%)",
          filter: "blur(80px)",
          borderRadius: "50%",
          animation: "ambient-drift-2 36s ease-in-out infinite",
        }}
      />
      {/* Blob 3 — forest (sutil) */}
      <div
        className="absolute"
        style={{
          left: "20%",
          bottom: "-10%",
          width: 640,
          height: 640,
          background: "radial-gradient(circle, rgba(40,76,43,0.12) 0%, transparent 60%)",
          filter: "blur(70px)",
          borderRadius: "50%",
          animation: "ambient-drift-3 32s ease-in-out infinite",
        }}
      />

      {/* Logo gigante atrás — identidade integrada entre dobras */}
      <div
        aria-hidden
        className="absolute select-none"
        style={{
          right: "-6%",
          top: "12%",
          color: "#284C2B",
          opacity: 0.04,
          transform: "scale(8) rotate(-6deg)",
          transformOrigin: "top right",
          pointerEvents: "none",
        }}
      >
        <LogoMark size={60} />
      </div>
      <div
        aria-hidden
        className="absolute select-none"
        style={{
          left: "-4%",
          bottom: "5%",
          color: "#6D92A6",
          opacity: 0.05,
          transform: "scale(6) rotate(12deg)",
          transformOrigin: "bottom left",
          pointerEvents: "none",
        }}
      >
        <LogoMark size={60} />
      </div>

      <style>{`
        @keyframes ambient-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(80px, -40px) scale(1.08); }
          66%      { transform: translate(-40px, 60px) scale(0.94); }
        }
        @keyframes ambient-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-90px, 50px) scale(1.12); }
        }
        @keyframes ambient-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(60px, -70px) scale(0.92); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="ambient"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
