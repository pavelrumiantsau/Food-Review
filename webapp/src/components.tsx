import { type ReactNode, useState } from "react";
import { haptic } from "./telegram";

const tone = (r: number) => (r >= 9 ? "great" : r >= 7 ? "good" : r >= 5 ? "ok" : "bad");

export function RatingBadge({ rating, imported = false }: { rating: number | null; imported?: boolean }) {
  if (rating === null) return <span className="badge empty">–</span>;
  return (
    <span className={`badge ${tone(rating)}${imported ? " imported" : ""}`} title={imported ? "Imported from 5-point scale" : undefined}>
      {rating}
    </span>
  );
}

/** 1–10 grid; tapping the selected value again clears it (unless `required`). */
export function RatingPicker({
  value,
  onChange,
  required = false,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  required?: boolean;
}) {
  return (
    <div className="rating-picker" role="radiogroup">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={value === n}
          className={value === n ? `selected ${tone(n)}` : ""}
          onClick={() => {
            haptic.select();
            onChange(value === n && !required ? null : n);
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Chips with free-text entry and suggestions; Enter or comma adds a chip. */
export function ChipsInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `chips-${placeholder}`;
  const add = (raw: string) => {
    const name = raw.trim();
    if (name && !value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
    setDraft("");
  };
  const lower = value.map((v) => v.toLowerCase());
  return (
    <div className="chips-input">
      {value.map((v) => (
        <button type="button" key={v} className="chip" onClick={() => onChange(value.filter((x) => x !== v))}>
          {v} ✕
        </button>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={placeholder}
        enterKeyHint="done"
        onChange={(e) => {
          const text = e.target.value;
          // Picking a datalist option or typing a comma commits the chip.
          if (text.endsWith(",")) add(text.slice(0, -1));
          else if (suggestions.includes(text)) add(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !lower.includes(s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || action) && (
        <div className="section-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Message({ error, loading }: { error?: string; loading?: boolean }) {
  if (error) return <p className="message error">{error}</p>;
  if (loading) return <p className="message">Loading…</p>;
  return null;
}

export const PRICE_LABELS = ["€", "€€", "€€€", "€€€€"];
