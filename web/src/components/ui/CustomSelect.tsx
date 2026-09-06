import { useEffect, useRef, useState } from "react";

import { Icon } from "../icons/IconSprite";

export type SelectOption = { value: string; label: string };

type CustomSelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
};

export function CustomSelect({ id, value, options, onChange, style, className }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className={`custom-select-wrap${className ? ` ${className}` : ""}`} style={style}>
      <button
        id={id}
        type="button"
        className="custom-select-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label ?? value}</span>
        <Icon name="chev-down" style={{ width: 12, height: 12, color: "var(--muted)" }} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`custom-select-item${opt.value === value ? " on" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
