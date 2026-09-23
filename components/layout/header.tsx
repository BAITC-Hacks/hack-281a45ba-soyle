import Link from "next/link";
import { RoleSwitcher } from "@/components/layout/role-switcher";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="container-page flex min-h-16 flex-wrap items-center gap-3 py-3 sm:gap-4">
        <Link href="/" className="mr-2 text-xl font-black tracking-tight text-blue-700" aria-label="SOYLE — главная">SOYLE</Link>
        <nav className="order-3 flex w-full flex-none flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs font-medium text-slate-600 sm:order-none sm:w-auto sm:flex-1 sm:justify-start sm:gap-x-5 sm:text-sm" aria-label="Основная навигация">
          <Link className="hover:text-blue-700" href="/catalog">Каталог</Link>
          <Link className="hover:text-blue-700" href="/business/new">Создать задачу</Link>
          <Link className="hover:text-blue-700" href="/business">Мои задачи</Link>
          <Link className="hover:text-blue-700" href="/team">Команда</Link>
        </nav>
        <div className="ml-auto"><RoleSwitcher /></div>
      </div>
    </header>
  );
}
