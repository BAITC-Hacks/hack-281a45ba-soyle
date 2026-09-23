import { listTeamProposals } from "@/lib/services/proposal-service";
import { ok, safeError } from "@/lib/utils/api";

export async function GET() {
  try {
    return ok(await listTeamProposals());
  } catch (error) {
    return safeError(error, "Не удалось загрузить предложения команды");
  }
}
