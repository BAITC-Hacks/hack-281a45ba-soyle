import type { ReadinessInput, ReadinessLevel, ReadinessResult, TaskFieldKey } from "@/types";

const scoreFields: Array<{
  field: TaskFieldKey;
  label: string;
  possible: number;
  recommendation: string;
}> = [
  { field: "context", label: "Контекст", possible: 10, recommendation: "Опишите текущую ситуацию и причины появления задачи." },
  { field: "need", label: "Потребность", possible: 10, recommendation: "Сформулируйте конкретную бизнес-потребность." },
  { field: "dataAndMaterials", label: "Данные и материалы", possible: 20, recommendation: "Перечислите доступные данные и материалы." },
  { field: "expectedResult", label: "Ожидаемый результат", possible: 15, recommendation: "Опишите результат, который должна представить команда." },
  { field: "successCriteria", label: "Критерии успеха", possible: 15, recommendation: "Добавьте измеримые критерии успешного результата." },
  { field: "constraints", label: "Ограничения", possible: 10, recommendation: "Укажите сроки, технологии или другие ограничения." },
  { field: "users", label: "Пользователи", possible: 10, recommendation: "Уточните, кто будет пользоваться решением." },
  { field: "contact", label: "Контакт", possible: 5, recommendation: "Добавьте контакт представителя бизнеса." },
  { field: "interactionFormat", label: "Формат взаимодействия", possible: 5, recommendation: "Опишите формат связи бизнеса с командой." },
];

export function scoreToLevel(score: number): { level: ReadinessLevel; label: string } {
  if (score >= 90) return { level: "PRIORITY", label: "Приоритетная" };
  if (score >= 70) return { level: "READY", label: "Готовая" };
  if (score >= 40) return { level: "WORKING", label: "Рабочая" };
  return { level: "REQUIRES_CLARIFICATION", label: "Требует уточнения" };
}

export function calculateReadiness(task: ReadinessInput): ReadinessResult {
  const confirmed = new Set(task.confirmedFields);
  const breakdown = scoreFields.map(({ field, label, possible }) => {
    const value = task[field];
    const earned = typeof value === "string" && value.trim().length > 0 && confirmed.has(field) ? possible : 0;
    return { field, label, earned, possible };
  });
  const score = breakdown.reduce((sum, item) => sum + item.earned, 0);
  const { level, label } = scoreToLevel(score);
  const missing = scoreFields.filter((item) => breakdown.find((part) => part.field === item.field)?.earned === 0);

  return {
    score,
    level,
    label,
    breakdown,
    missingFields: missing.map((item) => item.field),
    recommendations: missing.map((item) => item.recommendation),
  };
}
