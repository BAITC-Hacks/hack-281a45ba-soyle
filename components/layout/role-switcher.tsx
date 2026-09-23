"use client";

import { useEffect, useState } from "react";

export type DemoRole = "BUSINESS" | "TEAM";

export function RoleSwitcher() {
  const [role, setRole] = useState<DemoRole>("BUSINESS");

  useEffect(() => {
    const saved = window.localStorage.getItem("soyle-role");
    if (saved === "BUSINESS" || saved === "TEAM") setRole(saved);
  }, []);

  function choose(next: DemoRole) {
    setRole(next);
    window.localStorage.setItem("soyle-role", next);
    window.dispatchEvent(new CustomEvent("soyle-role", { detail: next }));
  }

  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1" aria-label="Демо-роль">
      {(["BUSINESS", "TEAM"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => choose(item)}
          aria-pressed={role === item}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${role === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {item === "BUSINESS" ? "БИЗНЕС" : "КОМАНДА"}
        </button>
      ))}
    </div>
  );
}
