import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

// Primitivos compartilhados da identidade Intertech Surgical.

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--cor-primaria)] px-5 py-2",
        "text-sm font-semibold text-white shadow-sm hover:bg-[#14147b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
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
        "w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm shadow-[0_1px_2px_rgb(4_4_100/0.03)]",
        "outline-none placeholder:text-slate-400 focus:border-[var(--cor-primaria)] focus:ring-4 focus:ring-indigo-100",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-cartao)] p-6 shadow-[var(--sombra-cartao)]", className)}>
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
    <span className="inline-flex items-center rounded-full bg-[var(--cor-primaria-clara)] px-2.5 py-1 text-xs font-semibold text-[var(--cor-primaria)]">
      {children}
    </span>
  );
}
