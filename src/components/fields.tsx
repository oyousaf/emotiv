"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Number input that lets you type freely and commits a clamped value on blur
 * or Enter, so half-typed values never reach the project document.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let n = Number(draft);
    if (!Number.isFinite(n)) return setDraft(String(value));
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    if (step >= 1) n = Math.round(n);
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className="relative">
      <input
        className="field pr-7 font-mono tabular-nums"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            let n = Number((value + d).toFixed(4));
            if (min != null) n = Math.max(min, n);
            if (max != null) n = Math.min(max, n);
            onChange(n);
          }
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-ink-500">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function NumberField(props: Parameters<typeof NumberInput>[0] & { label: string; className?: string }) {
  const { label, className, ...rest } = props;
  return (
    <Field label={label} className={className}>
      <NumberInput {...rest} />
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const valid = (v: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          className="h-8 w-8 shrink-0 cursor-pointer"
          value={(value ?? "#000000").slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="field font-mono text-xs"
          value={draft}
          placeholder={allowNone ? "none" : ""}
          onChange={(e) => {
            setDraft(e.target.value);
            if (valid(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => {
            if (allowNone && draft.trim() === "") onChange(null);
            else if (!valid(draft)) setDraft(value ?? "");
          }}
        />
        {allowNone && value ? (
          <button type="button" className="btn btn-ghost btn-icon text-xs" title="Remove" onClick={() => onChange(null)}>
            ✕
          </button>
        ) : null}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="w-full"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-10 text-right font-mono text-xs text-ink-300 tabular-nums">{format(value)}</span>
      </div>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200 select-none">
      <input type="checkbox" className="accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-ink-800 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="panel-title">{title}</h3>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
