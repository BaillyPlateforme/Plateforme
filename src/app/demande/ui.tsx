"use client";

import { type InputHTMLAttributes, type ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-ink-soft">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-ink " +
  "placeholder:text-ink-soft/50 outline-none transition " +
  "focus:border-accent focus:ring-2 focus:ring-accent/20";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2.5 text-sm"
      aria-pressed={checked}
    >
      <span
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="text-ink">{label}</span>
    </button>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-accent-soft/40 disabled:opacity-40 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}
