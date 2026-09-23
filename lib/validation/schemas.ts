import { z } from "zod";
import { confirmableFieldKeys } from "@/types";

const optionalText = z.string().trim().max(4000).nullable().optional();

export const idSchema = z.string().trim().min(1).max(100);

export const taskCardSchema = z.object({
  title: z.string().trim().min(2).max(160).nullable(),
  industry: z.string().trim().min(2).max(80).nullable(),
  context: z.string().trim().max(4000).nullable(),
  need: z.string().trim().max(4000).nullable(),
  users: z.string().trim().max(4000).nullable(),
  dataAndMaterials: z.string().trim().max(4000).nullable(),
  constraints: z.string().trim().max(4000).nullable(),
  expectedResult: z.string().trim().max(4000).nullable(),
  successCriteria: z.string().trim().max(4000).nullable(),
  contact: z.string().trim().max(500).nullable(),
  interactionFormat: z.string().trim().max(1000).nullable(),
});

export const createTaskSchema = z.object({
  initialDescription: z.string().trim().min(10, "Опишите задачу подробнее").max(4000),
  title: z.string().trim().min(2).max(160).optional(),
  industry: z.string().trim().min(2).max(80).optional(),
  context: optionalText,
  need: optionalText,
  users: optionalText,
  dataAndMaterials: optionalText,
  constraints: optionalText,
  expectedResult: optionalText,
  successCriteria: optionalText,
  contact: optionalText,
  interactionFormat: optionalText,
  confirmedFields: z.array(z.enum(confirmableFieldKeys)).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  publicationStatus: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const proposalSchema = z.object({
  teamName: z.string().trim().min(2).max(120),
  solutionIdea: z.string().trim().min(20).max(4000),
  plan: z.string().trim().min(20).max(6000),
  estimatedDuration: z.string().trim().min(2).max(200),
  prototypeUrl: z.union([z.string().trim().url("Укажите корректный URL"), z.literal(""), z.null()]).optional(),
});

export const analyzeInputSchema = z.object({
  initialDescription: z.string().trim().min(10).max(4000),
});

export const generateCardInputSchema = z.object({
  initialDescription: z.string().trim().min(10).max(4000),
  answers: z.array(z.object({ question: z.string().trim().min(2).max(1000), answer: z.string().trim().min(1).max(4000) })).min(1).max(12),
});

export const analysisSchema = z.object({
  detectedInformation: z.record(z.string(), z.string().nullable()),
  missingInformation: z.array(z.string()),
  questions: z.array(z.string().min(2)).min(3),
});

export const taskQuerySchema = z.object({
  industry: z.string().trim().max(80).optional(),
  level: z.enum(["REQUIRES_CLARIFICATION", "WORKING", "READY", "PRIORITY"]).optional(),
  sort: z.enum(["score_desc", "score_asc", "newest", "oldest"]).default("score_desc"),
});
