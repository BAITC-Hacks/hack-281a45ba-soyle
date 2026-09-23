import { notFound } from "next/navigation";
import { ProposalSection } from "@/components/proposal/proposal-section";
import { ReadinessPanel } from "@/components/score/readiness-panel";
import { ScoreBadge } from "@/components/score/score-badge";
import { getTask } from "@/lib/services/task-service";

export const dynamic = "force-dynamic";

const labels = {
  context: "Контекст", need: "Потребность", users: "Пользователи", dataAndMaterials: "Данные и материалы", constraints: "Ограничения", expectedResult: "Ожидаемый результат", successCriteria: "Критерии успеха", interactionFormat: "Формат взаимодействия", contact: "Контакт",
} as const;

export default async function TaskDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  let task;
  try { task = await getTask((await params).id); } catch (error) { if (error instanceof Error && error.message === "NOT_FOUND") notFound(); throw error; }
  return <div><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{task.industry}</p><h1 className="page-title mt-2 max-w-3xl">{task.title}</h1><p className="mt-2 text-sm text-slate-500">Опубликовано {new Date(task.updatedAt).toLocaleDateString("ru-RU")}</p></div><ScoreBadge readiness={task.readiness} /></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]"><div className="space-y-6"><section className="panel divide-y divide-slate-100">{Object.entries(labels).map(([key, label]) => <div key={key} className="py-4 first:pt-0 last:pb-0"><h2 className="text-sm font-bold text-slate-500">{label}</h2><p className="mt-1 whitespace-pre-wrap leading-7 text-slate-800">{task[key as keyof typeof labels] || "Не указано"}</p></div>)}</section><ProposalSection taskId={task.id} published={task.publicationStatus === "PUBLISHED"} /></div><ReadinessPanel readiness={task.readiness} /></div>
  </div>;
}
