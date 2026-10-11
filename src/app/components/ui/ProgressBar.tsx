const TONES: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function ProgressBar({
  value,
  max = 100,
  tone = "blue",
  label,
  showValue = true,
}: {
  value: number;
  max?: number;
  tone?: keyof typeof TONES | string;
  label: string;
  showValue?: boolean;
}) {
  const ratio = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-1.5 rounded-full bg-[#e9ecef] overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${TONES[tone] ?? TONES.blue}`}
          style={{ width: `${ratio}%` }}
        />
      </div>
      {showValue ? (
        <span
          className="text-[11px] text-[#6c757d] w-9 text-right shrink-0"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ratio.toFixed(0)}%
        </span>
      ) : null}
    </div>
  );
}
