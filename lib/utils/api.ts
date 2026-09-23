import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export function safeError(error: unknown, fallback = "Не удалось выполнить операцию") {
  if (error instanceof Error && error.message === "NOT_FOUND") return fail("NOT_FOUND", "Запись не найдена", 404);
  return fail("INTERNAL_ERROR", fallback, 500);
}
