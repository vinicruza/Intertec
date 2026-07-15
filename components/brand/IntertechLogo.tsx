import { cn } from "@components/ui/cn";

import logoUrl from "./intertek-logo.png";

type Props = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

// Marca oficial Intertek. A imagem tem fundo transparente; em superfícies
// escuras usamos `inverse` para renderizá-la em branco (brightness-0 invert).
export function IntertechLogo({ compact = false, inverse = false, className }: Props) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={logoUrl}
        alt="Intertek"
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
