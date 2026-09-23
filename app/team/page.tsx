import { EmptyState } from "@/components/ui/empty-state";
import { listTeamProposals } from "@/lib/services/proposal-service";

export const dynamic = "force-dynamic";

const labels = { PENDING: "На рассмотрении", ACCEPTED: "Принято", REJECTED: "Отклонено" } as const;

export default async function TeamPage() {
  const proposals = await listTeamProposals();
  return <div><p className="eyebrow">Режим команды</p><h1 className="page-title mt-2">Мои предложения</h1><p className="mt-2 text-slate-600">Демо-история откликов команд без сложного управления проектами.</p><div className="mt-7">{proposals.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="hidden grid-cols-[1.2fr_1.5fr_.7fr_.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Команда</span><span>Задача</span><span>Статус</span><span>Отправлено</span></div>{proposals.map((proposal) => <article className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.2fr_1.5fr_.7fr_.8fr] md:items-center" key={proposal.id}><strong>{proposal.teamName}</strong><a className="text-sm font-semibold text-blue-700" href={`/tasks/${proposal.taskId}`}>{proposal.task?.title}</a><span className="text-sm">{labels[proposal.status]}</span><div className="text-sm text-slate-500"><span>{new Date(proposal.createdAt).toLocaleDateString("ru-RU")}</span>{proposal.prototypeUrl && <a href={proposal.prototypeUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-blue-700">Прототип ↗</a>}</div></article>)}</div> : <EmptyState title="Предложений пока нет" description="Откройте каталог, выберите задачу и отправьте идею решения." />}</div></div>;
}
