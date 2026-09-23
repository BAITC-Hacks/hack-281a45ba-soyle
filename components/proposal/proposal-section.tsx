"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, ProposalView } from "@/types";
import type { DemoRole } from "@/components/layout/role-switcher";

export function ProposalSection({ taskId, published }: { taskId: string; published: boolean }) {
  const [role, setRole] = useState<DemoRole>("BUSINESS");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const read = () => { const value = window.localStorage.getItem("soyle-role"); setRole(value === "TEAM" ? "TEAM" : "BUSINESS"); };
    read();
    const listener = (event: Event) => setRole((event as CustomEvent<DemoRole>).detail);
    window.addEventListener("soyle-role", listener);
    return () => window.removeEventListener("soyle-role", listener);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/tasks/${taskId}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const json = await response.json() as ApiResponse<ProposalView>;
    setPending(false);
    if (!json.success) { setError(json.error.message); return; }
    setSuccess(true);
  }

  if (role !== "TEAM" || !published) return null;
  if (success) return <div className="panel border-emerald-200 bg-emerald-50"><h2 className="font-bold text-emerald-900">Предложение отправлено</h2><p className="mt-1 text-sm text-emerald-800">Бизнес увидит его на странице предложений и вручную примет решение.</p></div>;

  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Режим команды</p><h2 className="mt-1 text-xl font-bold">Есть идея решения?</h2></div><button type="button" className="button-primary" onClick={() => setOpen(!open)}>{open ? "Скрыть форму" : "Предложить решение"}</button></div>
    {open && <form className="mt-6 space-y-4 border-t border-slate-100 pt-5" onSubmit={submit}>
      <div><label className="label" htmlFor="teamName">Название команды</label><input className="input" id="teamName" name="teamName" required minLength={2} maxLength={120} /></div>
      <div><label className="label" htmlFor="solutionIdea">Идея решения</label><textarea className="input min-h-28" id="solutionIdea" name="solutionIdea" required minLength={20} maxLength={4000} /></div>
      <div><label className="label" htmlFor="plan">План</label><textarea className="input min-h-28" id="plan" name="plan" required minLength={20} maxLength={6000} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="estimatedDuration">Предполагаемый срок</label><input className="input" id="estimatedDuration" name="estimatedDuration" required /></div><div><label className="label" htmlFor="prototypeUrl">Ссылка на прототип</label><input className="input" id="prototypeUrl" name="prototypeUrl" type="url" placeholder="https://..." /></div></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Отправляем…" : "Отправить предложение"}</button>
    </form>}
  </section>;
}
