import Link from "next/link";
import { ScoreBadge } from "@/components/score/score-badge";
import type { TaskView } from "@/types";

export function TaskCard({ task }: { task: TaskView }) {
  return (
    <article className="panel flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{task.industry}</span>
        <ScoreBadge readiness={task.readiness} />
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-950">{task.title}</h2>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{task.need || task.initialDescription}</p>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Не заполнено: {task.readiness.missingFields.length} · Откликов: {task.proposalCount}</span>
        <Link className="font-semibold text-blue-700 hover:text-blue-800" href={`/tasks/${task.id}`}>Подробнее →</Link>
      </div>
    </article>
  );
}
