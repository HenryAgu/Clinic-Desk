import type { AppointmentStatus, Patient, VisitMode, VisitType } from "./schema";

export { STATUSES, type AppointmentStatus } from "./schema";

export type Provider = { id: string; name: string; specialty: string };

export type Insurance = { carrier: string; memberId: string; groupNumber: string | null };

export type Appointment = {
  id: string;
  patient: Patient;
  providerId: string;
  visitType: VisitType;
  mode: VisitMode;
  /** ISO 8601 instant (UTC). */
  startsAt: string;
  durationMinutes: 30 | 60;
  status: AppointmentStatus;
  insurance: Insurance | null;
  cancellationReason: string | null;
  createdAt: string;
};

export const STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["checked-in", "no-show", "cancelled"],
  "checked-in": ["completed", "cancelled"],
  completed: [], cancelled: [], "no-show": [],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) =>
  STATUS_TRANSITIONS[from].includes(to);
