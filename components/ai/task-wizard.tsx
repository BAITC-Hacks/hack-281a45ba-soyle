"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { calculateReadiness } from "@/lib/scoring/calculate-readiness";
import { ReadinessPanel } from "@/components/score/readiness-panel";
import type { ApiResponse, TaskView } from "@/types";

type Analysis = {
  questions: string[];
  detectedInformation: Record<string, string | null>;
  missingInformation: string[];
  fallback: boolean;
  fallbackLabel: string | null;
};

type Card = {
  title: string | null;
  industry: string | null;
  context: string | null;
  need: string | null;
  users: string | null;
  dataAndMaterials: string | null;
  constraints: string | null;
  expectedResult: string | null;
  successCriteria: string | null;
  contact: string | null;
  interactionFormat: string | null;
};

const fields: Array<{ key: keyof Card; label: string; rows?: number }> = [
  { key: "title", label: "Название" },
  { key: "industry", label: "Отрасль" },
  { key: "context", label: "Контекст", rows: 3 },
  { key: "need", label: "Потребность", rows: 3 },
  { key: "users", label: "Пользователи", rows: 2 },
  { key: "dataAndMaterials", label: "Данные и материалы", rows: 3 },
  { key: "constraints", label: "Ограничения", rows: 2 },
  { key: "expectedResult", label: "Ожидаемый результат", rows: 3 },
  { key: "successCriteria", label: "Критерии успеха", rows: 3 },
  { key: "interactionFormat", label: "Формат взаимодействия", rows: 2 },
  { key: "contact", label: "Контакт" },
];

const steps = ["Черновик", "Вопросы AI", "Карточка", "Готовность", "Публикация"];

export function TaskWizard() {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("У нас учебный центр. Хотим улучшить работу с учениками и понимать, почему некоторые перестают ходить.");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [saved, setSaved] = useState<TaskView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const liveReadiness = useMemo(() => calculateReadiness({
    context: card?.context,
    need: card?.need,
    users: card?.users,
    dataAndMaterials: card?.dataAndMaterials,
    constraints: card?.constraints,
    expectedResult: card?.expectedResult,
    successCriteria: card?.successCriteria,
    contact: card?.contact,
    interactionFormat: card?.interactionFormat,
    confirmedFields: confirmed,
  }), [card, confirmed]);

  async function post<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json() as ApiResponse<T>;
    if (!json.success) throw new Error(json.error.message);
    return json.data;
  }

  async function analyze() {
    setPending(true); setError("");
    try {
      const data = await post<Analysis>("/api/ai/analyze", { initialDescription: description });
      setAnalysis(data); setAnswers(data.questions.map(() => "")); setStep(2);
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось выполнить анализ"); }
    finally { setPending(false); }
  }

  async function generate() {
    if (!analysis) return;
    setPending(true); setError("");
    try {
      const data = await post<{ card: Card; fallback: boolean; fallbackLabel: string | null }>("/api/ai/generate-card", {
        initialDescription: description,
        answers: analysis.questions.map((question, index) => ({ question, answer: answers[index] })).filter((item) => item.answer.trim()),
      });
      setCard(data.card);
      setAnalysis((current) => current ? { ...current, fallback: current.fallback || data.fallback, fallbackLabel: current.fallbackLabel || data.fallbackLabel } : current);
      setStep(3);
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось сформировать карточку"); }
    finally { setPending(false); }
  }

  async function saveDraft() {
    if (!card) return;
    setPending(true); setError("");
    try {
      const task = await post<TaskView>("/api/tasks", {
        initialDescription: description,
        ...card,
        title: card.title || "Новая бизнес-задача",
        industry: card.industry || "Не указана",
        confirmedFields: confirmed,
      });
      setSaved(task); setStep(4);
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить черновик"); }
    finally { setPending(false); }
  }

  async function publish() {
    if (!saved) return;
    setPending(true); setError("");
    try {
      setSaved(await post<TaskView>(`/api/tasks/${saved.id}/publish`));
      setStep(5);
    } catch (err) { setError(err instanceof Error ? err.message : "Не удалось опубликовать задачу"); }
    finally { setPending(false); }
  }

  return (
    <div>
      <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Этапы создания задачи">
        {steps.map((label, index) => (
          <li key={label} className={`rounded-lg border px-2 py-3 text-center text-xs font-semibold sm:text-sm ${step === index + 1 ? "border-blue-600 bg-blue-50 text-blue-800" : step > index + 1 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-400"}`}>
            <span className="block text-[10px] uppercase tracking-wide">Шаг {index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {analysis?.fallback && <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>DEMO FALLBACK:</strong> OpenAI недоступен или ключ не настроен. Используется локальный детерминированный сценарий.</div>}
      {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {step === 1 && (
        <section className="panel">
          <p className="eyebrow">Шаг 1 · Черновик</p>
          <h2 className="mt-2 text-xl font-bold">Опишите проблему или задачу своими словами</h2>
          <label className="label mt-5" htmlFor="initial-description">Описание задачи</label>
          <textarea id="initial-description" className="input min-h-44 resize-y" value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} placeholder="У нас сеть кофеен, и мы хотим лучше понимать, почему клиенты не возвращаются после первого заказа..." />
          <div className="mt-5 flex items-center justify-between gap-4"><span className="muted">{description.length}/4000</span><button type="button" className="button-primary" disabled={pending || description.trim().length < 10} onClick={analyze}>{pending ? "AI анализирует…" : "Продолжить с AI"}</button></div>
        </section>
      )}

      {step === 2 && analysis && (
        <section className="panel">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Шаг 2 · Уточнение</p><h2 className="mt-2 text-xl font-bold">Ответьте на вопросы</h2></div><span className="text-sm font-semibold text-slate-500">{answers.filter((item) => item.trim()).length} из {analysis.questions.length} отвечено</span></div>
          <div className="mt-6 space-y-5">
            {analysis.questions.map((question, index) => <div key={question}><label className="label" htmlFor={`answer-${index}`}>{index + 1}. {question}</label><textarea id={`answer-${index}`} className="input min-h-24" value={answers[index]} onChange={(event) => setAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div>)}
          </div>
          <div className="mt-6 flex justify-between"><button className="button-secondary" type="button" onClick={() => setStep(1)}>Назад</button><button className="button-primary" type="button" disabled={pending || answers.filter((item) => item.trim()).length < 3} onClick={generate}>{pending ? "Формируем…" : "Сформировать карточку"}</button></div>
        </section>
      )}

      {step === 3 && card && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="panel"><p className="eyebrow">Шаг 3 · Карточка</p><h2 className="mt-2 text-xl font-bold">Проверьте и подтвердите поля</h2><p className="mt-2 text-sm text-slate-500">AI не добавляет неизвестные факты. Дополните пустые поля вручную.</p>
            <div className="mt-6 space-y-5">{fields.map((field) => <div key={field.key}><label className="label" htmlFor={`field-${field.key}`}>{field.label}</label>{field.rows ? <textarea id={`field-${field.key}`} rows={field.rows} className="input" value={card[field.key] || ""} onChange={(event) => setCard({ ...card, [field.key]: event.target.value })} /> : <input id={`field-${field.key}`} className="input" value={card[field.key] || ""} onChange={(event) => setCard({ ...card, [field.key]: event.target.value })} />}<label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={confirmed.includes(field.key)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...new Set([...current, field.key])] : current.filter((item) => item !== field.key))} />{field.label} подтверждено</label></div>)}</div>
            <div className="mt-6 flex justify-between"><button className="button-secondary" type="button" onClick={() => setStep(2)}>Назад</button><button className="button-primary" type="button" disabled={pending} onClick={saveDraft}>{pending ? "Сохраняем…" : "Сохранить и рассчитать"}</button></div>
          </section>
          <div className="lg:sticky lg:top-6 lg:self-start"><ReadinessPanel readiness={liveReadiness} /></div>
        </div>
      )}

      {step === 4 && saved && <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="panel"><p className="eyebrow">Шаг 4 · Готовность</p><h2 className="mt-2 text-2xl font-bold">{saved.title}</h2><p className="mt-3 text-slate-600">Черновик сохранён. Низкий рейтинг не блокирует публикацию: решение остаётся за бизнесом.</p><div className="mt-6 flex flex-wrap gap-3"><Link className="button-secondary" href={`/business/tasks/${saved.id}`}>Редактировать</Link><button className="button-primary" type="button" disabled={pending} onClick={publish}>{pending ? "Публикуем…" : "Опубликовать задачу"}</button></div></section><ReadinessPanel readiness={saved.readiness} /></div>}

      {step === 5 && saved && <section className="panel text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div><p className="eyebrow mt-4">Шаг 5 · Опубликовано</p><h2 className="mt-2 text-2xl font-bold">Задача появилась в каталоге</h2><p className="mt-2 text-slate-500">Теперь студенческие команды могут открыть карточку и отправить предложение.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link className="button-primary" href={`/tasks/${saved.id}`}>Открыть в каталоге</Link><Link className="button-secondary" href="/business">Мои задачи</Link></div></section>}
    </div>
  );
}
