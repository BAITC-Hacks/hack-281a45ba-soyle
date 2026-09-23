"use client";

import { useState } from "react";
import type { ApiResponse, ProposalStatus, ProposalView } from "@/types";

const statusLabels: Record<ProposalStatus, string> = { PENDING: "На рассмотрении", ACCEPTED: "Принято", REJECTED: "Отклонено" };

export function ProposalList({ initialProposals }: { initialProposals: ProposalView[] }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function update(id: string, action: "accept" | "reject") {
    setPendingId(id); setError("");
    const response = await fetch(`/api/proposals/${id}/${action}`, { method: "POST" });
    const json = await response.json() as ApiResponse<ProposalView>;
    setPendingId(null);
    if (!json.success) { setError(json.error.message); return; }
    setProposals((current) => current.map((item) => item.id === id ? json.data : item));
  }

  return <div className="space-y-4">{error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}{proposals.map((proposal) => <article key={proposal.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{proposal.teamName}</p><h2 className="mt-2 text-lg font-bold">{proposal.solutionIdea}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${proposal.status === "ACCEPTED" ? "bg-emerald-50 text-emerald-800" : proposal.status === "REJECTED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{statusLabels[proposal.status]}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><h3 className="text-sm font-bold text-slate-500">План</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{proposal.plan}</p></div><div><h3 className="text-sm font-bold text-slate-500">Срок</h3><p className="mt-1 text-sm">{proposal.estimatedDuration}</p>{proposal.prototypeUrl && <a className="mt-2 inline-block text-sm font-semibold text-blue-700" href={proposal.prototypeUrl} target="_blank" rel="noreferrer">Открыть прототип ↗</a>}</div></div><div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button className="button-primary" type="button" disabled={pendingId === proposal.id || proposal.status === "ACCEPTED"} onClick={() => update(proposal.id, "accept")}>Принять</button><button className="button-danger" type="button" disabled={pendingId === proposal.id || proposal.status === "REJECTED"} onClick={() => update(proposal.id, "reject")}>Отклонить</button></div></article>)}</div>;
}
