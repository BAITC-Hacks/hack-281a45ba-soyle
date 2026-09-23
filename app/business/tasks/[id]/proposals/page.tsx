import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalList } from "@/components/proposal/proposal-list";
import { EmptyState } from "@/components/ui/empty-state";
import { getTask } from "@/lib/services/task-service";
import { listProposals } from "@/lib/services/proposal-service";

export const dynamic = "force-dynamic";

export default async function BusinessProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let task;
  try { task = await getTask(id); } catch (error) { if (error instanceof Error && error.message === "NOT_FOUND") notFound(); throw error; }
  const proposals = await listProposals(id);
  return <div><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Предложения команд</p><h1 className="page-title mt-2">{task.title}</h1><p className="mt-2 text-slate-500">Решение принимает бизнес. Можно принять несколько предложений.</p></div><Link className="button-secondary" href="/business">К моим задачам</Link></div><div className="mt-7">{proposals.length ? <ProposalList initialProposals={proposals} /> : <EmptyState title="Предложений пока нет" description="Когда команда отправит идею, она появится здесь для ручного решения." />}</div></div>;
}
