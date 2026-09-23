import { getBusinessDashboard } from "@/lib/services/task-service";
import { ok, safeError } from "@/lib/utils/api";

export async function GET() {
  try {
    return ok(await getBusinessDashboard());
  } catch (error) {
    return safeError(error, "Не удалось загрузить задачи бизнеса");
  }
}
