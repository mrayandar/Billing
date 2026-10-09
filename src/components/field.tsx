import type { ReactNode } from "react";

// A labelled form box that matches the designs (small grey label above a 44 px input).
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-muted">
        {label} {hint && <span>· {hint}</span>}
      </span>
      {children}
    </label>
  );
}
