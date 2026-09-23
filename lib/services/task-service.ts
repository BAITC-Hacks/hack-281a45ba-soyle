import type { BusinessTask, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateReadiness } from "@/lib/scoring/calculate-readiness";
import type { ReadinessLevel, TaskView } from "@/types";

type TaskRecord = BusinessTask & { _count?: { proposals: number } };

function parseConfirmedFields(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function toTaskView(task: TaskRecord): TaskView {
  const confirmedFields = parseConfirmedFields(task.confirmedFields);
  const readiness = calculateReadiness({ ...task, confirmedFields });
  return {
    ...task,
    publicationStatus: task.publicationStatus as TaskView["publicationStatus"],
    confirmedFields,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    proposalCount: task._count?.proposals ?? 0,
    readiness,
  };
}

const includeCount = { _count: { select: { proposals: true } } } as const;

export async function listPublishedTasks(filters: { industry?: string; level?: ReadinessLevel; sort: string }) {
  const records = await prisma.businessTask.findMany({
    where: { publicationStatus: "PUBLISHED", ...(filters.industry ? { industry: filters.industry } : {}) },
    include: includeCount,
  });
  let tasks = records.map(toTaskView);
  if (filters.level) tasks = tasks.filter((task) => task.readiness.level === filters.level);
  tasks.sort((a, b) => {
    if (filters.sort === "score_asc") return a.readiness.score - b.readiness.score;
    if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (filters.sort === "newest") return b.createdAt.localeCompare(a.createdAt);
    return b.readiness.score - a.readiness.score;
  });
  return tasks;
}

export async function getTask(id: string) {
  const task = await prisma.businessTask.findUnique({ where: { id }, include: includeCount });
  if (!task) throw new Error("NOT_FOUND");
  return toTaskView(task);
}

export async function createTask(input: {
  initialDescription: string;
  title?: string;
  industry?: string;
  confirmedFields?: string[];
  context?: string | null;
  need?: string | null;
  users?: string | null;
  dataAndMaterials?: string | null;
  constraints?: string | null;
  expectedResult?: string | null;
  successCriteria?: string | null;
  contact?: string | null;
  interactionFormat?: string | null;
}) {
  const task = await prisma.businessTask.create({
    data: {
      ...input,
      title: input.title || "Новая бизнес-задача",
      industry: input.industry || "Не указана",
      confirmedFields: JSON.stringify(input.confirmedFields ?? []),
    },
    include: includeCount,
  });
  return toTaskView(task);
}

export async function updateTask(id: string, input: Record<string, unknown> & { confirmedFields?: string[] }) {
  const { confirmedFields, ...rest } = input;
  const data: Prisma.BusinessTaskUpdateInput = { ...rest };
  if (confirmedFields) data.confirmedFields = JSON.stringify(confirmedFields);
  try {
    const task = await prisma.businessTask.update({ where: { id }, data, include: includeCount });
    return toTaskView(task);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2025") throw new Error("NOT_FOUND");
    throw error;
  }
}

export async function publishTask(id: string) {
  return updateTask(id, { publicationStatus: "PUBLISHED" });
}

export async function getBusinessDashboard() {
  const records = await prisma.businessTask.findMany({ include: includeCount, orderBy: { updatedAt: "desc" } });
  const tasks = records.map(toTaskView);
  return {
    totals: {
      tasks: tasks.length,
      published: tasks.filter((task) => task.publicationStatus === "PUBLISHED").length,
      drafts: tasks.filter((task) => task.publicationStatus === "DRAFT").length,
      proposals: tasks.reduce((sum, task) => sum + task.proposalCount, 0),
    },
    tasks,
  };
}
