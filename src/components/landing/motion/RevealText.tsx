// Texto que revela palavra por palavra ao entrar no viewport.
import { useEffect, useRef, useState, type ElementType, type CSSProperties } from "react";

type Props = {
  text: string;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  trigger?: boolean;
  delay?: number;
  highlight?: {
    word: string;
    color: string;
  };
};

export function RevealText({
  text,
  className,
  style,
  as: As = "h1",
  trigger = true,
  delay = 0,
  highlight,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [trigger]);

  const words = text.split(" ");
  const Tag = As as ElementType;
  return (
    <Tag ref={ref} className={className} style={style}>
      {words.map((w, i) => {
        const isHighlighted = highlight && w.replace(/[.,;:]/g, "") === highlight.word;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(28px)",
              transition: `opacity 0.6s cubic-bezier(.22,.61,.36,1) ${
                delay + i * 60
              }ms, transform 0.6s cubic-bezier(.22,.61,.36,1) ${delay + i * 60}ms`,
              willChange: "opacity, transform",
              ...(isHighlighted ? { fontStyle: "italic", color: highlight!.color } : null),
              marginRight: "0.27em",
            }}
          >
            {w}
          </span>
        );
      })}
    </Tag>
  );
}
