import { randomLatency, rollChaos } from "@/lib/server/chaos";
import { fail, ok, simulatedFailure } from "@/lib/server/respond";
import { getAppointment } from "@/lib/server/store";

export async function GET(req: Request, ctx: RouteContext<"/api/appointments/[id]">) {
  const { id } = await ctx.params;
  await randomLatency();
  if (rollChaos(req, { isWrite: false }) !== "ok") return simulatedFailure();
  const appt = await getAppointment(id);
  return appt ? ok(appt) : fail("Appointment not found", 404);
}
