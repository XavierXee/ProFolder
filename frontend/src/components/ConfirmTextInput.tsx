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
  const defaultLabelText = `Type "${expectedText}" to confirm`;
  // The label's own `uppercase` class (below) is purely decorative styling for the "Type"/"to
  // confirm" boilerplate — but naively uppercasing `expectedText` along with it would visually
  // suggest the user should type it in all caps, when the actual comparison in
  // useTypedConfirmation is exact/case-sensitive against the real-cased value. Wrapping just the
  // interpolated text in `normal-case` preserves its real casing regardless of the parent's
  // `uppercase` class. Splitting the label's visible content across a nested element like this
  // changes how browsers compute an accessible name FROM CONTENT (the accname spec joins each
  // child's text alternative with an inserted space, e.g. `Type " DELETE " to confirm`) — so the
  // `<input>` below gets an explicit `aria-label` with the original, unsplit string, which takes
  // priority over content-based label computation and keeps the accessible name exactly as it
  // was (matching every existing `getByLabelText`/label-associated `getByRole` query). The
  // `aria-label` must live on the `<input>`, not the `<label>` — putting it on the `<label>`
  // itself makes `getByLabelText` also match the `<label>` element directly (as if it were a
  // second labelled control), producing an ambiguous multi-match.
  const resolvedLabel = label ?? (
    <>
      Type &quot;
      <span className="normal-case">{expectedText}</span>
      &quot; to confirm
    </>
  );

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
        aria-label={label ?? defaultLabelText}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-[var(--rt-radius)] text-sm px-2.5 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
      />
    </div>
  );
}
