import { addDays } from "date-fns";
import { canTransition, type Appointment, type Provider } from "../domain";
import {
  clinicStartsAt,
  toUtcIso,
  visitDurationMinutes,
  type AppointmentListQuery,
  type Booking,
  type StatusUpdate,
} from "../schema";
import { seedData } from "./seed";

type Db = {
  providers: Provider[];
  appointments: Appointment[];
  /** Idempotency-Key -> appointment id, so a retried POST returns the original booking. */
  bookingKeys: Map<string, string>;
};

const createDb = (): Db => ({ ...seedData(), bookingKeys: new Map() });

const g = globalThis as unknown as { __db?: Db };
export const db = () => (g.__db ??= createDb());

export async function listProviders() {
  return db().providers;
}

export async function getAppointment(id: string) {
  return db().appointments.find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const patientName = (a: Appointment) => `${a.patient.firstName} ${a.patient.lastName}`.toLowerCase();

const collator = new Intl.Collator("en", { sensitivity: "base" });

const comparators = {
  startsAt: (a: Appointment, b: Appointment) => a.startsAt.localeCompare(b.startsAt),
  patient: (a: Appointment, b: Appointment) =>
    collator.compare(a.patient.lastName, b.patient.lastName) ||
    collator.compare(a.patient.firstName, b.patient.firstName),
} satisfies Record<AppointmentListQuery["sortBy"], (a: Appointment, b: Appointment) => number>;

export async function listAppointments(query: AppointmentListQuery) {
  const { page, pageSize, search, status, providerId, from, to, sortBy, sortOrder } = query;
  const needle = search?.toLowerCase();
  // Date filters are clinic-local calendar days, `to` inclusive.
  const fromIso = from && toUtcIso(clinicStartsAt(from, "00:00"));
  const toIso = to && toUtcIso(addDays(clinicStartsAt(to, "00:00"), 1));

  const matches = db().appointments.filter(
    (a) =>
      (!needle || patientName(a).includes(needle) || a.patient.email.toLowerCase().includes(needle)) &&
      (status.length === 0 || status.includes(a.status)) &&
      (!providerId || a.providerId === providerId) &&
      (!fromIso || a.startsAt >= fromIso) &&
      (!toIso || a.startsAt < toIso),
  );

  const direction = sortOrder === "asc" ? 1 : -1;
  // Tie-break on id so equal keys never swap places between pages.
  matches.sort((a, b) => direction * comparators[sortBy](a, b) || a.id.localeCompare(b.id));

  const start = (page - 1) * pageSize;
  return {
    content: matches.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: matches.length,
      totalPages: Math.max(1, Math.ceil(matches.length / pageSize)),
    },
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateResult =
  | { kind: "created" | "replayed"; appointment: Appointment }
  | { kind: "unknown-provider" }
  | { kind: "conflict" };

const endsAt = (a: Pick<Appointment, "startsAt" | "durationMinutes">) =>
  Date.parse(a.startsAt) + a.durationMinutes * 60_000;

function toAppointment({ patient, visit, payment }: Booking): Appointment {
  return {
    id: crypto.randomUUID(),
    patient,
    providerId: visit.providerId,
    visitType: visit.type,
    mode: visit.mode,
    startsAt: toUtcIso(clinicStartsAt(visit.date, visit.time)),
    durationMinutes: visitDurationMinutes(visit.type),
    status: "scheduled",
    insurance:
      payment.method === "insurance"
        ? { carrier: payment.carrier, memberId: payment.memberId, groupNumber: payment.groupNumber || null }
        : null,
    cancellationReason: null,
    createdAt: new Date().toISOString(),
  };
}

export async function createAppointment(booking: Booking, idempotencyKey?: string): Promise<CreateResult> {
  const store = db();

  // Checked before the conflict test: a retry of a saved booking would otherwise conflict with itself.
  const existingId = idempotencyKey && store.bookingKeys.get(idempotencyKey);
  const existing = existingId && store.appointments.find((a) => a.id === existingId);
  if (existing) return { kind: "replayed", appointment: existing };

  if (!store.providers.some((p) => p.id === booking.visit.providerId)) return { kind: "unknown-provider" };

  const candidate = toAppointment(booking);
  const start = Date.parse(candidate.startsAt);
  const overlaps = store.appointments.some(
    (a) =>
      a.providerId === candidate.providerId &&
      a.status !== "cancelled" &&
      Date.parse(a.startsAt) < endsAt(candidate) &&
      start < endsAt(a),
  );
  if (overlaps) return { kind: "conflict" };

  store.appointments.push(candidate);
  if (idempotencyKey) store.bookingKeys.set(idempotencyKey, candidate.id);
  return { kind: "created", appointment: candidate };
}

// ---------------------------------------------------------------------------
// Update status
// ---------------------------------------------------------------------------

export type UpdateResult =
  | { kind: "updated" | "unchanged"; appointment: Appointment }
  | { kind: "not-found" }
  | { kind: "invalid-transition"; appointment: Appointment };

export async function updateAppointmentStatus(id: string, update: StatusUpdate): Promise<UpdateResult> {
  const { appointments } = db();
  const index = appointments.findIndex((a) => a.id === id);
  if (index === -1) return { kind: "not-found" };

  const current = appointments[index];
  // Already in the requested state: treat as a retry of a write that saved, not an error.
  if (current.status === update.status) return { kind: "unchanged", appointment: current };
  if (!canTransition(current.status, update.status)) return { kind: "invalid-transition", appointment: current };

  const next: Appointment = {
    ...current,
    status: update.status,
    cancellationReason: update.status === "cancelled" ? update.cancellationReason : current.cancellationReason,
  };
  appointments[index] = next;
  return { kind: "updated", appointment: next };
}
