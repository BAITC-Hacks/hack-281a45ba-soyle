import { TaskWizard } from "@/components/ai/task-wizard";

export default function NewBusinessTaskPage() {
  return <div><p className="eyebrow">Для бизнеса</p><h1 className="page-title mt-2">Создать задачу</h1><p className="mt-2 mb-8 text-slate-600">AI поможет собрать недостающую информацию, но все факты и финальное решение остаются за вами.</p><TaskWizard /></div>;
}
