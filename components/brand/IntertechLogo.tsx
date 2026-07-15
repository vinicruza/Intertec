import { cn } from "@components/ui/cn";

type Props = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

export function IntertechLogo({ compact = false, inverse = false, className }: Props) {
  const primary = inverse ? "#ffffff" : "#040464";
  const accent = inverse ? "#c9c9ff" : "#6d5bd0";

  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="Intertech Surgical">
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" role="img" aria-hidden="true">
        <path d="M8 34C11 20 20 11 35 8" fill="none" stroke={primary} strokeWidth="5" strokeLinecap="round" />
        <path d="M14 39C20 25 29 17 41 14" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" />
        <circle cx="10" cy="10" r="4" fill={accent} />
      </svg>
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className={cn("text-[1.35rem] font-bold tracking-[-0.035em]", inverse ? "text-white" : "text-[var(--cor-primaria)]")}>
            Intertech
          </div>
          <div className={cn("mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.26em]", inverse ? "text-indigo-100" : "text-[var(--cor-texto-suave)]")}>
            Surgical
          </div>
        </div>
      )}
    </div>
  );
}
