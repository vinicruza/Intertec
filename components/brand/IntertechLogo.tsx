import { cn } from "@components/ui/cn";

import logoUrl from "./intertech-logo.svg";

type Props = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

// Marca oficial Intertech, vetorizada (SVG) para nitidez em qualquer tamanho.
// Em superfícies escuras usamos `inverse` para renderizá-la em branco.
export function IntertechLogo({ compact = false, inverse = false, className }: Props) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={logoUrl}
        alt="Intertech"
        className={cn(
          "w-auto shrink-0 select-none",
          compact ? "h-9" : "h-14",
          inverse && "brightness-0 invert"
        )}
        draggable={false}
      />
    </div>
  );
}
