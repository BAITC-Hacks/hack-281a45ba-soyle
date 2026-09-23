import { getTask, updateTask } from "@/lib/services/task-service";
import { idSchema, updateTaskSchema } from "@/lib/validation/schemas";
import { fail, ok, safeError } from "@/lib/utils/api";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Некорректный идентификатор", 400);
  try {
    return ok(await getTask(parsedId.data));
  } catch (error) {
    return safeError(error, "Не удалось загрузить задачу");
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Некорректный идентификатор", 400);
  try {
    const parsed = updateTaskSchema.safeParse(await request.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Проверьте поля", 400);
    return ok(await updateTask(parsedId.data, parsed.data));
  } catch (error) {
    if (error instanceof SyntaxError) return fail("MALFORMED_JSON", "Тело запроса должно быть корректным JSON", 400);
    return safeError(error, "Не удалось сохранить задачу");
  }
}
