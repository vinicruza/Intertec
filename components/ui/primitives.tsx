import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

// Primitivos de UI mínimos no estilo shadcn/ui. Novos componentes entram
// conforme as telas das próximas sprints precisarem.

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-[var(--cor-primaria)] px-4 py-2",
        "text-sm font-medium text-white transition hover:opacity-90",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm",
        "outline-none focus:border-[var(--cor-primaria)]",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-[var(--cor-borda)] bg-[var(--cor-cartao)] p-6 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-[var(--cor-texto)]">
      {children}
    </label>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--cor-primaria)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--cor-primaria)]">
      {children}
    </span>
  );
}
