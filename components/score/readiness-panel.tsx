import type { ReadinessResult } from "@/types";

export function ReadinessPanel({ readiness }: { readiness: ReadinessResult }) {
  return (
    <section className="panel" aria-labelledby="readiness-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Readiness score</p>
          <h2 id="readiness-heading" className="mt-1 text-3xl font-black">{readiness.score}<span className="text-lg text-slate-400">/100</span></h2>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{readiness.label}</p>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label={`Готовность ${readiness.score} из 100`}>
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${readiness.score}%` }} />
      </div>
      <div className="mt-5 space-y-2">
        {readiness.breakdown.map((item) => (
          <div key={item.field} className="flex items-center justify-between gap-4 text-sm">
            <span className={item.earned ? "text-slate-700" : "text-slate-500"}>{item.label}</span>
            <span className="font-semibold tabular-nums">{item.earned} / {item.possible}</span>
          </div>
        ))}
      </div>
      {readiness.recommendations.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-bold">Как улучшить</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            {readiness.recommendations.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
