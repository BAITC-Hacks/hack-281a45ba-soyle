import type { Proposal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ProposalStatus, ProposalView } from "@/types";

type ProposalRecord = Proposal & { task?: { id: string; title: string } };

function toProposalView(proposal: ProposalRecord): ProposalView {
  return {
    ...proposal,
    status: proposal.status as ProposalStatus,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

export async function listProposals(taskId: string) {
  const exists = await prisma.businessTask.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!exists) throw new Error("NOT_FOUND");
  return (await prisma.proposal.findMany({ where: { taskId }, orderBy: { createdAt: "desc" } })).map(toProposalView);
}

export async function createProposal(taskId: string, input: { teamName: string; solutionIdea: string; plan: string; estimatedDuration: string; prototypeUrl?: string | null }) {
  const task = await prisma.businessTask.findUnique({ where: { id: taskId }, select: { publicationStatus: true } });
  if (!task) throw new Error("NOT_FOUND");
  if (task.publicationStatus !== "PUBLISHED") throw new Error("TASK_NOT_PUBLISHED");
  return toProposalView(await prisma.proposal.create({ data: { taskId, ...input, prototypeUrl: input.prototypeUrl || null } }));
}

export async function setProposalStatus(id: string, status: ProposalStatus) {
  try {
    return toProposalView(await prisma.proposal.update({ where: { id }, data: { status } }));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2025") throw new Error("NOT_FOUND");
    throw error;
  }
}

export async function listTeamProposals() {
  const records = await prisma.proposal.findMany({ include: { task: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
  return records.map(toProposalView);
}
