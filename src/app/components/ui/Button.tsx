import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "text-white bg-blue-600 hover:bg-blue-700 border border-blue-600",
  secondary: "text-[#6c757d] bg-white hover:bg-[#f8f9fa] border border-[#dee2e6]",
  ghost: "text-[#6c757d] hover:text-[#1a1d23] border border-transparent",
  danger: "text-white bg-red-600 hover:bg-red-700 border border-red-600",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11px]",
  md: "h-8 px-3 text-[12px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
