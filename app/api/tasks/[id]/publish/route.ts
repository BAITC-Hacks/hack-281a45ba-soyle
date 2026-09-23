import { publishTask } from "@/lib/services/task-service";
import { idSchema } from "@/lib/validation/schemas";
import { fail, ok, safeError } from "@/lib/utils/api";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Некорректный идентификатор", 400);
  try {
    return ok(await publishTask(parsedId.data));
  } catch (error) {
    return safeError(error, "Не удалось опубликовать задачу");
  }
}
