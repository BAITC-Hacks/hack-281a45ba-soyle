import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskEditor } from "@/components/task/task-editor";
import { getTask } from "@/lib/services/task-service";

export const dynamic = "force-dynamic";

export default async function EditBusinessTaskPage({ params }: { params: Promise<{ id: string }> }) {
  let task;
  try { task = await getTask((await params).id); } catch (error) { if (error instanceof Error && error.message === "NOT_FOUND") notFound(); throw error; }
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Редактор бизнеса</p><h1 className="page-title mt-2">{task.title}</h1></div><div className="flex gap-2"><Link className="button-secondary" href={`/tasks/${task.id}`}>Открыть карточку</Link><Link className="button-secondary" href={`/business/tasks/${task.id}/proposals`}>Предложения</Link></div></div><p className="mt-2 mb-7 text-slate-600">Изменяйте значения и подтверждайте только проверенные поля.</p><TaskEditor task={task} /></div>;
}
