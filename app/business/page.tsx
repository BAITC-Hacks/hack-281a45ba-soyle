import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge } from "@/components/score/score-badge";
import { getBusinessDashboard } from "@/lib/services/task-service";

export const dynamic = "force-dynamic";

export default async function BusinessDashboardPage() {
  const dashboard = await getBusinessDashboard();
  const metrics = [
    ["Всего задач", dashboard.totals.tasks], ["Опубликовано", dashboard.totals.published], ["Черновики", dashboard.totals.drafts], ["Предложения", dashboard.totals.proposals],
  ];
  return <div><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Режим бизнеса</p><h1 className="page-title mt-2">Мои задачи</h1></div><Link className="button-primary" href="/business/new">Создать задачу</Link></div>
    <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div className="panel" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</div>
    <div className="mt-8">{dashboard.tasks.length ? <div className="space-y-4">{dashboard.tasks.map((task) => <article className="panel" key={task.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-bold ${task.publicationStatus === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{task.publicationStatus === "PUBLISHED" ? "Опубликована" : "Черновик"}</span><ScoreBadge readiness={task.readiness} compact /></div><h2 className="mt-3 text-lg font-bold">{task.title}</h2><p className="mt-1 text-sm text-slate-500">{task.industry} · Предложений: {task.proposalCount}</p></div><div className="flex flex-wrap gap-2"><Link className="button-secondary" href={`/business/tasks/${task.id}`}>Редактировать</Link><Link className="button-secondary" href={`/tasks/${task.id}`}>Посмотреть</Link><Link className="button-primary" href={`/business/tasks/${task.id}/proposals`}>Предложения</Link></div></div></article>)}</div> : <EmptyState title="Пока нет задач" description="Создайте первый черновик: AI поможет задать вопросы и собрать карточку." />}</div>
  </div>;
}
