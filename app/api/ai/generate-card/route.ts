import { generateTaskCard } from "@/lib/ai/service";
import { generateCardInputSchema } from "@/lib/validation/schemas";
import { fail, ok, safeError } from "@/lib/utils/api";

export async function POST(request: Request) {
  try {
    const parsed = generateCardInputSchema.safeParse(await request.json());
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Ответьте на вопросы", 400);
    return ok(await generateTaskCard(parsed.data.initialDescription, parsed.data.answers));
  } catch (error) {
    if (error instanceof SyntaxError) return fail("MALFORMED_JSON", "Тело запроса должно быть корректным JSON", 400);
    if (error instanceof Error && error.name === "AI_INVALID_RESPONSE") return fail("AI_INVALID_RESPONSE", error.message, 502);
    return safeError(error, "Не удалось сформировать карточку");
  }
}
