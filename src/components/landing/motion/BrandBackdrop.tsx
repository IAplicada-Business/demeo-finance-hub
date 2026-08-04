// Aurora — Symbol gigante translúcido como elemento decorativo de seção.
// Substitui fundos lisos com identidade visual integrada.
import { LogoMark } from "@/components/Logo";

type Props = {
  position?: "right-top" | "left-bottom" | "center" | "right-bottom";
  scale?: number;
  color?: string;
  opacity?: number;
  rotate?: number;
};

export function BrandBackdrop({
  position = "right-top",
  scale = 6,
  color = "#284C2B",
  opacity = 0.04,
  rotate = -8,
}: Props) {
  const positions: Record<string, React.CSSProperties> = {
    "right-top": {
      right: "-8%",
      top: "10%",
      transformOrigin: "top right",
    },
    "left-bottom": {
      left: "-10%",
      bottom: "-5%",
      transformOrigin: "bottom left",
    },
    center: {
      left: "50%",
      top: "50%",
      transformOrigin: "center",
      marginLeft: `-${scale * 30}px`,
      marginTop: `-${scale * 40}px`,
    },
    "right-bottom": {
      right: "-5%",
      bottom: "-15%",
      transformOrigin: "bottom right",
    },
  };

  return (
    <div
      aria-hidden
      className="absolute pointer-events-none select-none"
      style={{
        ...positions[position],
        color,
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        zIndex: 0,
      }}
    >
      <LogoMark size={60} />
    </div>
  );
}
