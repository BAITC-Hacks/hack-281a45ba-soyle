import { describe, expect, it } from "vitest";
import { calculateReadiness, scoreToLevel } from "../lib/scoring/calculate-readiness";

const full = {
  context: "Контекст", need: "Потребность", users: "Пользователи", dataAndMaterials: "Данные", constraints: "Ограничения", expectedResult: "Результат", successCriteria: "Критерии", contact: "demo@example.com", interactionFormat: "Онлайн",
};
const keys = Object.keys(full);

describe("calculateReadiness", () => {
  it("returns 0 for an empty confirmed task", () => expect(calculateReadiness({ confirmedFields: [] }).score).toBe(0));
  it("returns 100 when every field is populated and confirmed", () => expect(calculateReadiness({ ...full, confirmedFields: keys }).score).toBe(100));
  it("does not score whitespace", () => expect(calculateReadiness({ context: "   ", confirmedFields: ["context"] }).score).toBe(0));
  it("does not score an unconfirmed populated field", () => expect(calculateReadiness({ context: "Есть", confirmedFields: [] }).score).toBe(0));
  it("scores context as 10", () => expect(calculateReadiness({ context: "Есть", confirmedFields: ["context"] }).score).toBe(10));
  it("scores context and need as 20", () => expect(calculateReadiness({ context: "Есть", need: "Есть", confirmedFields: ["context", "need"] }).score).toBe(20));
  it("is deterministic", () => {
    const input = { ...full, confirmedFields: keys };
    expect(calculateReadiness(input)).toEqual(calculateReadiness(input));
  });
});

describe("scoreToLevel boundaries", () => {
  it.each([
    [39, "REQUIRES_CLARIFICATION"], [40, "WORKING"], [69, "WORKING"], [70, "READY"], [89, "READY"], [90, "PRIORITY"], [100, "PRIORITY"],
  ] as const)("maps %i to %s", (score, level) => expect(scoreToLevel(score).level).toBe(level));
});
