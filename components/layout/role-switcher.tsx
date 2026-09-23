"use client";

import { useSyncExternalStore } from "react";

export type DemoRole = "BUSINESS" | "TEAM";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("soyle-role", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("soyle-role", callback);
  };
}

function getRoleSnapshot(): DemoRole {
  return window.localStorage.getItem("soyle-role") === "TEAM" ? "TEAM" : "BUSINESS";
}

export function useDemoRole() {
  return useSyncExternalStore(subscribe, getRoleSnapshot, () => "BUSINESS");
}

export function RoleSwitcher() {
  const role = useDemoRole();

  function choose(next: DemoRole) {
    window.localStorage.setItem("soyle-role", next);
    window.dispatchEvent(new Event("soyle-role"));
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
