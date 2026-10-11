/**
 * Accessible switch. Uses role="switch" + aria-checked so screen readers
 * announce the state, and exposes a visible focus ring for keyboard users.
 */
export function ToggleSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        on ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-[18px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}
