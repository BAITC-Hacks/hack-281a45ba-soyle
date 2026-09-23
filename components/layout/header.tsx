import Link from "next/link";
import { RoleSwitcher } from "@/components/layout/role-switcher";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="container-page flex min-h-16 flex-wrap items-center gap-4 py-3">
        <Link href="/" className="mr-2 text-xl font-black tracking-tight text-blue-700" aria-label="SOYLE — главная">SOYLE</Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-slate-600" aria-label="Основная навигация">
          <Link className="hover:text-blue-700" href="/catalog">Каталог</Link>
          <Link className="hover:text-blue-700" href="/business/new">Создать задачу</Link>
          <Link className="hover:text-blue-700" href="/business">Мои задачи</Link>
          <Link className="hover:text-blue-700" href="/team">Команда</Link>
        </nav>
        <RoleSwitcher />
      </div>
    </header>
  );
}
