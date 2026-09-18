import { useId } from "react";

export default function ConfirmTextInput({
  expectedText,
  value,
  onChange,
  label,
  autoFocus = false,
  disabled = false,
}: {
  expectedText: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputBg = "bg-canvas border-border text-ink placeholder-ink-muted";
  const resolvedLabel = label ?? `Type "${expectedText}" to confirm`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-mono uppercase tracking-wider mb-2 text-slate-500"
      >
        {resolvedLabel}
      </label>
      <input
        id={inputId}
        type="text"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-[var(--rt-radius)] text-sm px-2.5 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
      />
    </div>
  );
}
