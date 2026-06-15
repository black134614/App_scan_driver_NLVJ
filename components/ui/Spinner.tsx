type SpinnerSize = "sm" | "md" | "lg";

const sizeCls: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export default function Spinner({
  size = "md",
  className = "",
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Đang tải"
      className={`inline-block animate-spin rounded-full border-slate-300 border-t-blue-600 ${sizeCls[size]} ${className}`}
    />
  );
}
