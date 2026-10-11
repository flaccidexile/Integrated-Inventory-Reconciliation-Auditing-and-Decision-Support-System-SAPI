import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="w-9 h-9 rounded-full bg-[#f1f3f5] flex items-center justify-center">
        <Icon size={16} className="text-[#adb5bd]" aria-hidden="true" />
      </div>
      <p className="text-[13px] font-medium text-[#1a1d23]">{title}</p>
      <p className="text-[12px] text-[#6c757d] max-w-sm">{message}</p>
    </div>
  );
}
