import { randomLatency, rollChaos } from "@/lib/server/chaos";
import { ok, simulatedFailure } from "@/lib/server/respond";
import { listProviders } from "@/lib/server/store";

export async function GET(req: Request) {
  await randomLatency();
  if (rollChaos(req, { isWrite: false }) !== "ok") return simulatedFailure();
  return ok(await listProviders());
}
