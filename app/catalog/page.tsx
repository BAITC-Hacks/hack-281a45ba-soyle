import { EmptyState } from "@/components/ui/empty-state";
import { TaskCard } from "@/components/task/task-card";
import { listPublishedTasks } from "@/lib/services/task-service";
import type { ReadinessLevel } from "@/types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ industry?: string; level?: string; sort?: string }> };

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const level = ["REQUIRES_CLARIFICATION", "WORKING", "READY", "PRIORITY"].includes(params.level || "") ? params.level as ReadinessLevel : undefined;
  const sort = ["score_desc", "score_asc", "newest", "oldest"].includes(params.sort || "") ? params.sort! : "score_desc";
  const [tasks, allTasks] = await Promise.all([
    listPublishedTasks({ industry: params.industry, level, sort }),
    listPublishedTasks({ sort: "score_desc" }),
  ]);
  const industries = [...new Set(allTasks.map((task) => task.industry))].sort();

  return <div><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Для команд</p><h1 className="page-title mt-2">Каталог задач</h1><p className="mt-2 text-slate-600">Все опубликованные задачи, включая те, которым ещё нужны уточнения.</p></div><span className="text-sm font-semibold text-slate-500">Найдено: {tasks.length}</span></div>
    <form className="panel mt-7 grid gap-4 md:grid-cols-3" action="/catalog" method="get">
      <div><label className="label" htmlFor="industry">Отрасль</label><select className="input" id="industry" name="industry" defaultValue={params.industry || ""}><option value="">Все отрасли</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div><label className="label" htmlFor="level">Готовность</label><select className="input" id="level" name="level" defaultValue={level || ""}><option value="">Все уровни</option><option value="REQUIRES_CLARIFICATION">Требует уточнения</option><option value="WORKING">Рабочая</option><option value="READY">Готовая</option><option value="PRIORITY">Приоритетная</option></select></div>
      <div><label className="label" htmlFor="sort">Сортировка</label><div className="flex gap-2"><select className="input" id="sort" name="sort" defaultValue={sort}><option value="score_desc">Сначала высокий рейтинг</option><option value="score_asc">Сначала низкий рейтинг</option><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select><button className="button-primary" type="submit">Применить</button></div></div>
    </form>
    <div className="mt-7">{tasks.length ? <div className="grid gap-5 md:grid-cols-2">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <EmptyState title="Задачи не найдены" description="Измените фильтры или вернитесь позже — опубликованные задачи появятся здесь." />}</div>
  </div>;
}
