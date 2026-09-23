import Link from "next/link";

export default function NotFound() {
  return <div className="panel py-14 text-center"><p className="eyebrow">404</p><h1 className="mt-2 text-2xl font-bold">Страница или задача не найдена</h1><p className="mt-2 text-slate-500">Возможно, ссылка устарела или запись была удалена.</p><Link className="button-primary mt-6" href="/catalog">Открыть каталог</Link></div>;
}
