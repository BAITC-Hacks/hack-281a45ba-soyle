import { createProposal, listProposals } from "@/lib/services/proposal-service";
import { idSchema, proposalSchema } from "@/lib/validation/schemas";
import { fail, ok, safeError } from "@/lib/utils/api";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Некорректный идентификатор", 400);
  try {
    return ok(await listProposals(parsedId.data));
  } catch (error) {
    return safeError(error, "Не удалось загрузить предложения");
  }
}

export async function POST(request: Request, { params }: Context) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return fail("VALIDATION_ERROR", "Некорректный идентификатор", 400);
  try {
    const parsed = proposalSchema.safeParse(await request.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Проверьте предложение", 400);
    return ok(await createProposal(parsedId.data, parsed.data), 201);
  } catch (error) {
    if (error instanceof SyntaxError) return fail("MALFORMED_JSON", "Тело запроса должно быть корректным JSON", 400);
    if (error instanceof Error && error.message === "TASK_NOT_PUBLISHED") return fail("TASK_NOT_PUBLISHED", "Предложения принимаются только для опубликованных задач", 409);
    return safeError(error, "Не удалось отправить предложение");
  }
}
