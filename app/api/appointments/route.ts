import type { NextRequest } from "next/server";
import { randomLatency, rollChaos } from "@/lib/server/chaos";
import { fail, ok, readJson, simulatedFailure, toFieldErrors } from "@/lib/server/respond";
import { createAppointment, listAppointments } from "@/lib/server/store";
import { appointmentListQuerySchema, bookingSchema } from "@/lib/schema";
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/api-type";

export async function GET(req: NextRequest) {
  await randomLatency();
  if (rollChaos(req, { isWrite: false }) !== "ok") return simulatedFailure();

  const params = req.nextUrl.searchParams;
  const parsed = appointmentListQuerySchema.safeParse({
    ...Object.fromEntries([...params].filter(([, value]) => value !== "")),
    // Accept both `status=a&status=b` and `status=a,b`.
    status: params.getAll("status").flatMap((value) => value.split(",")).filter(Boolean),
  });
  if (!parsed.success) return fail("Invalid query parameters", 400, { errors: toFieldErrors(parsed.error.issues) });

  return ok(await listAppointments(parsed.data));
}

export async function POST(req: NextRequest) {
  await randomLatency();
  const chaos = rollChaos(req, { isWrite: true });
  if (chaos === "fail-before") return simulatedFailure();

  const parsed = bookingSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("Please fix the highlighted fields", 400, { errors: toFieldErrors(parsed.error.issues) });

  const idempotencyKey = req.headers.get(IDEMPOTENCY_KEY_HEADER)?.slice(0, 200) || undefined;
  const result = await createAppointment(parsed.data, idempotencyKey);

  switch (result.kind) {
    case "unknown-provider":
      return fail("That provider is no longer available", 400, {
        errors: { "visit.providerId": ["This provider is no longer available. Choose another."] },
      });
    case "conflict":
      return fail("That time is no longer available", 409, {
        errors: { "visit.time": ["This provider is already booked at that time. Choose another slot."] },
      });
    case "created":
    case "replayed":
      // The booking is saved; the client just doesn't hear about it.
      if (chaos === "fail-after") return simulatedFailure();
      return result.kind === "created"
        ? ok(result.appointment, 201, "Appointment booked")
        : ok(result.appointment, 200, "Appointment already booked");
  }
}
