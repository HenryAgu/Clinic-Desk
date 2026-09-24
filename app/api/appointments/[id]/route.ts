import { randomLatency, rollChaos } from "@/lib/server/chaos";
import { fail, ok, readJson, simulatedFailure, toFieldErrors } from "@/lib/server/respond";
import { getAppointment, updateAppointmentStatus } from "@/lib/server/store";
import { statusUpdateSchema } from "@/lib/schema";

export async function GET(req: Request, ctx: RouteContext<"/api/appointments/[id]">) {
  const { id } = await ctx.params;
  await randomLatency();
  if (rollChaos(req, { isWrite: false }) !== "ok") return simulatedFailure();
  const appt = await getAppointment(id);
  return appt ? ok(appt) : fail("Appointment not found", 404);
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/appointments/[id]">) {
  const { id } = await ctx.params;
  await randomLatency();
  const chaos = rollChaos(req, { isWrite: true });
  if (chaos === "fail-before") return simulatedFailure();

  const parsed = statusUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("Please fix the highlighted fields", 400, { errors: toFieldErrors(parsed.error.issues) });

  const result = await updateAppointmentStatus(id, parsed.data);

  switch (result.kind) {
    case "not-found":
      return fail("Appointment not found", 404);
    case "invalid-transition":
      // 409 carries the current record so the client can resync instead of refetching.
      return fail(`Cannot change a ${result.appointment.status} appointment to ${parsed.data.status}`, 409, {
        data: result.appointment,
      });
    case "updated":
    case "unchanged":
      if (chaos === "fail-after") return simulatedFailure();
      return ok(result.appointment, 200, result.kind === "updated" ? "Appointment updated" : "No change");
  }
}
