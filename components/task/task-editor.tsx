"use client";

import { useMemo, useState } from "react";
import { calculateReadiness } from "@/lib/scoring/calculate-readiness";
import { ReadinessPanel } from "@/components/score/readiness-panel";
import type { ApiResponse, TaskView } from "@/types";

const fields = [
  ["title", "Название"], ["industry", "Отрасль"], ["context", "Контекст"], ["need", "Потребность"], ["users", "Пользователи"], ["dataAndMaterials", "Данные и материалы"], ["constraints", "Ограничения"], ["expectedResult", "Ожидаемый результат"], ["successCriteria", "Критерии успеха"], ["interactionFormat", "Формат взаимодействия"], ["contact", "Контакт"],
] as const;

type FormState = Pick<TaskView, "title" | "industry" | "context" | "need" | "users" | "dataAndMaterials" | "constraints" | "expectedResult" | "successCriteria" | "interactionFormat" | "contact">;

export function TaskEditor({ task }: { task: TaskView }) {
  const [form, setForm] = useState<FormState>(Object.fromEntries(fields.map(([key]) => [key, task[key]])) as FormState);
  const [confirmed, setConfirmed] = useState(task.confirmedFields);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const readiness = useMemo(() => calculateReadiness({ ...form, confirmedFields: confirmed }), [form, confirmed]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setMessage(""); setError("");
    const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, confirmedFields: confirmed }) });
    const json = await response.json() as ApiResponse<TaskView>;
    setPending(false);
    if (!json.success) { setError(json.error.message); return; }
    setMessage("Изменения сохранены. Readiness score пересчитан.");
  }

  return <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="panel"><div className="space-y-5">{fields.map(([key, label]) => <div key={key}><label className="label" htmlFor={`edit-${key}`}>{label}</label>{key === "title" || key === "industry" || key === "contact" ? <input className="input" id={`edit-${key}`} value={form[key] || ""} required={key === "title" || key === "industry"} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /> : <textarea className="input min-h-24" id={`edit-${key}`} value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />}<label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={confirmed.includes(key)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} />{label} подтверждено</label></div>)}</div>
      {message && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}<button className="button-primary mt-6" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить изменения"}</button></section><div className="lg:sticky lg:top-6 lg:self-start"><ReadinessPanel readiness={readiness} /></div></form>;
}
