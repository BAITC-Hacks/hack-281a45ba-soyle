import { describe, expect, it } from "vitest";
import { analysisSchema, proposalSchema, taskCardSchema, updateTaskSchema } from "../lib/validation/schemas";

describe("API validation", () => {
  it("rejects a malformed prototype URL", () => expect(proposalSchema.safeParse({ teamName: "Team", solutionIdea: "Достаточно подробная идея решения", plan: "Достаточно подробный и понятный план", estimatedDuration: "3 недели", prototypeUrl: "wrong" }).success).toBe(false));
  it("accepts explicit proposal statuses only", () => expect(updateTaskSchema.safeParse({ publicationStatus: "ARCHIVED" }).success).toBe(false));
  it("requires at least three AI questions", () => expect(analysisSchema.safeParse({ detectedInformation: {}, missingInformation: [], questions: ["Один?", "Два?"] }).success).toBe(false));
  it("rejects missing AI card fields", () => expect(taskCardSchema.safeParse({ title: "Задача" }).success).toBe(false));
});
