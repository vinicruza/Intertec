import { cn } from "@components/ui/cn";

import logoUrl from "./intertech-logo.svg";

type Props = {
  compact?: boolean;
  inverse?: boolean;
  /** "lg" dá mais destaque (ex.: painel do login no desktop). */
  size?: "md" | "lg";
  className?: string;
};

// Marca oficial Intertech, vetorizada (SVG) para nitidez em qualquer tamanho.
// Em superfícies escuras usamos `inverse` para renderizá-la em branco.
export function IntertechLogo({ compact = false, inverse = false, size = "md", className }: Props) {
  const altura = compact ? "h-9" : size === "lg" ? "h-32 xl:h-40" : "h-14";

  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={logoUrl}
        alt="Intertech"
        className={cn("w-auto shrink-0 select-none", altura, inverse && "brightness-0 invert")}
        draggable={false}
      />
    </div>
  );
}
