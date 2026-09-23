import { createTaskSchema, taskQuerySchema } from "@/lib/validation/schemas";
import { createTask, listPublishedTasks } from "@/lib/services/task-service";
import { fail, ok, safeError } from "@/lib/utils/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = taskQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("VALIDATION_ERROR", "Некорректные параметры каталога", 400);
  try {
    return ok(await listPublishedTasks(parsed.data));
  } catch (error) {
    return safeError(error, "Не удалось загрузить каталог");
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createTaskSchema.safeParse(await request.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Проверьте данные задачи", 400);
    return ok(await createTask(parsed.data), 201);
  } catch (error) {
    if (error instanceof SyntaxError) return fail("MALFORMED_JSON", "Тело запроса должно быть корректным JSON", 400);
    return safeError(error, "Не удалось создать черновик");
  }
}
