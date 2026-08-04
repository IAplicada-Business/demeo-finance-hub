// CTA magnético — segue sutilmente o mouse e tem brilho de hover.
import { useRef, type ReactNode, type CSSProperties } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline";
  style?: CSSProperties;
  target?: string;
  rel?: string;
};

const INK = "#1C2D45";
const FOREST = "#284C2B";

export function MagneticButton({ href, children, variant = "solid", style, target, rel }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);

  function handleMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.18;
    const dy = (e.clientY - cy) * 0.18;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
  }
  function handleLeave() {
    if (ref.current) ref.current.style.transform = "";
  }

  const base: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 500,
    padding: "16px 28px",
    borderRadius: 999,
    letterSpacing: "0.2px",
    transition: "transform 0.4s cubic-bezier(.22,.61,.36,1), box-shadow 0.3s, background 0.3s",
    cursor: "pointer",
    textDecoration: "none",
    willChange: "transform",
    overflow: "hidden",
  };

  if (variant === "solid") {
    return (
      <a
        ref={ref}
        href={href}
        target={target}
        rel={rel}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="focus-ring"
        style={{
          ...base,
          background: `linear-gradient(135deg, ${FOREST} 0%, #1f3a22 100%)`,
          color: "#fff",
          boxShadow: "0 10px 28px -10px rgba(40,76,43,0.5), 0 2px 6px rgba(40,76,43,0.2)",
          ...style,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)",
            pointerEvents: "none",
          }}
        />
        <span style={{ position: "relative" }}>{children}</span>
      </a>
    );
  }

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="focus-ring"
      style={{
        ...base,
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: INK,
        border: "1px solid rgba(28,45,69,0.18)",
        boxShadow: "0 4px 12px rgba(28,45,69,0.06)",
        ...style,
      }}
    >
      {children}
    </a>
  );
}
