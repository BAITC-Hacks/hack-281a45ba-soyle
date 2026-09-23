"use client";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="panel text-center"><h1 className="text-2xl font-bold">Не удалось загрузить страницу</h1><p className="mt-2 text-slate-500">Проверьте подключение к базе данных и попробуйте ещё раз.</p><button type="button" className="button-primary mt-5" onClick={reset}>Повторить</button></div>;
}
