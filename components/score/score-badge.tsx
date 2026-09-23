import type { ReadinessResult } from "@/types";

const colors: Record<ReadinessResult["level"], string> = {
  REQUIRES_CLARIFICATION: "bg-amber-50 text-amber-800 ring-amber-200",
  WORKING: "bg-sky-50 text-sky-800 ring-sky-200",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PRIORITY: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function ScoreBadge({ readiness, compact = false }: { readiness: ReadinessResult; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${colors[readiness.level]}`}>
      <span>{readiness.score}/100</span>
      {!compact && <span>· {readiness.label}</span>}
    </span>
  );
}
