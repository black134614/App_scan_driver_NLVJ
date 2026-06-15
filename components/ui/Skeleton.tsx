function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 ${className}`}
      aria-hidden
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <SkeletonBlock className={className} />;
}

export function SkeletonTable({
  rows = 5,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-2 p-4" aria-busy aria-label="Đang tải dữ liệu">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={`h-${i}`} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBlock key={col} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy
      aria-label="Đang tải"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
        >
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Vertical list skeleton (driver truck list) */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-2" aria-busy aria-label="Đang tải">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
        >
          <SkeletonBlock className="h-6 w-1/2" />
          <SkeletonBlock className="h-4 w-3/4" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonGrid({
  rows = 4,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-2 p-4" aria-busy aria-label="Đang tải lưới">
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-24 shrink-0" />
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-2">
          <SkeletonBlock className="h-14 w-24 shrink-0" />
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBlock key={col} className="h-14 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
