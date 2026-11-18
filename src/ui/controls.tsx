import { useEffect, useState, type ReactNode } from 'react';
import type { Store } from '../core/store';

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel-section">
      <header>
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Range slider that groups a whole drag into one undo step. */
export function Slider({
  store,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
}: {
  store: Store;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  return (
    <label className="field slider" title={hint}>
      <span className="field-label">
        {label}
        <output>{format ? format(value) : Math.round(value * 100) / 100}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => store.beginGesture()}
        onPointerUp={() => store.endGesture()}
        onKeyDown={() => store.endGesture()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Number input that commits on blur / Enter. */
export function NumberField({ label, value, onCommit, step = 1, suffix }: { label: string; value: number; onCommit: (v: number) => void; step?: number; suffix?: string }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && fmt(v) !== fmt(value)) onCommit(v);
    else setText(fmt(value));
  };
  return (
    <label className="field number">
      <span className="field-label">{label}</span>
      <span className="number-wrap">
        <input
          inputMode="decimal"
          value={text}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const v = (Number(text) || 0) + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1);
              onCommit(v);
            }
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

function fmt(v: number) {
  return String(Math.round(v * 10) / 10);
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
