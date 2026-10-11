export interface FilterTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Segmented control used for every status filter in the system. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: FilterTabsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 flex-wrap">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`text-[11px] px-2.5 h-7 rounded border font-medium transition-colors whitespace-nowrap ${
              active
                ? "bg-blue-600 text-white border-blue-600"
                : "text-[#6c757d] border-[#dee2e6] bg-white hover:bg-[#f8f9fa]"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
