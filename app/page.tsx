import Link from "next/link";

const stages = ["Опишите задачу", "AI поможет её уточнить", "Получите readiness score", "Опубликуйте", "Получите предложения команд"];

export default function HomePage() {
  return (
    <div className="py-8 sm:py-14">
      <section className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">SOYLE</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Платформа бизнес-задач для студенческих команд</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">Превратите сырое описание проблемы в понятную задачу, оцените её готовность и получите предложения команд.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/business/new" className="button-primary">Создать задачу</Link><Link href="/catalog" className="button-secondary">Открыть каталог</Link></div>
      </section>
      <section className="mx-auto mt-14 max-w-5xl" aria-labelledby="process-heading">
        <h2 id="process-heading" className="sr-only">Как работает SOYLE</h2>
        <ol className="grid gap-3 sm:grid-cols-5">{stages.map((stage, index) => <li key={stage} className="panel p-4"><span className="text-sm font-black text-blue-600">0{index + 1}</span><p className="mt-3 text-sm font-semibold leading-5">{stage}</p></li>)}</ol>
      </section>
    </div>
  );
}
