import type { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";

const variantCls: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-500",
  ghost:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500",
};

const sizeCls = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizeCls;
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" className="border-t-current border-slate-300/40" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
