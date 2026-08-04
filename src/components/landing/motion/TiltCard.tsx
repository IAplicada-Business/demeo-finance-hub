// Card com tilt 3D no hover — segue o mouse com perspectiva.
import { useRef, useState, type ReactNode, type CSSProperties } from "react";

type Props = {
  children: ReactNode;
  intensity?: number; // 1..15 graus
  style?: CSSProperties;
  className?: string;
};

export function TiltCard({ children, intensity = 8, style, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<string>("");

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const ry = (x - 0.5) * intensity;
    const rx = (0.5 - y) * intensity;
    setTransform(`perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`);
  }

  function handleLeave() {
    setTransform("perspective(1100px) rotateX(0) rotateY(0) translateZ(0)");
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{
        transform,
        transition: "transform 0.45s cubic-bezier(.22,.61,.36,1)",
        transformStyle: "preserve-3d",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
