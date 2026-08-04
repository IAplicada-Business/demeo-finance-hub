import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isoToPtBR, maskDatePtBRInput, parseDatePtBR } from "@/lib/utils";

export interface DateInputProps {
  value: string; // yyyy-mm-dd
  onChange: (iso: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  style?: CSSProperties;
  id?: string;
  name?: string;
  disabled?: boolean;
}

function inRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** Input de data pt-BR (dd/mm/aaaa). Valor externo sempre ISO yyyy-mm-dd. */
export function DateInput({
  value,
  onChange,
  required,
  min,
  max,
  className,
  style,
  id,
  name,
  disabled,
}: DateInputProps) {
  const [text, setText] = useState(() => isoToPtBR(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(isoToPtBR(value));
  }, [value]);

  function commitText(next: string) {
    if (next.length < 10) return;
    const iso = parseDatePtBR(next);
    if (!iso || !inRange(iso, min, max)) return;
    if (iso !== value) onChange(iso);
  }

  return (
    <div className="relative inline-flex w-full items-center" style={{ minWidth: 0 }}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        required={required}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const masked = maskDatePtBRInput(e.target.value);
          setText(masked);
          commitText(masked);
        }}
        onBlur={() => {
          const iso = parseDatePtBR(text);
          if (iso && inRange(iso, min, max)) {
            setText(isoToPtBR(iso));
            if (iso !== value) onChange(iso);
          } else {
            setText(isoToPtBR(value));
          }
        }}
        className={className}
        style={{
          ...style,
          paddingRight: 36,
          width: "100%",
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Abrir calendário"
        onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.click()}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          border: "none",
          background: "transparent",
          color: "var(--muted-foreground)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value || ""}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const iso = e.target.value;
          if (!iso) return;
          if (!inRange(iso, min, max)) return;
          setText(isoToPtBR(iso));
          onChange(iso);
        }}
        style={{
          position: "absolute",
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
