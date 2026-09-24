import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { differenceInYears, parseISO } from "date-fns";

export const CLINIC_TIME_ZONE = "America/New_York";
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 17;
export const SLOT_MINUTES = 30;

export const VISIT_TYPES = ["initial", "follow-up", "medication-management"] as const;
export const VISIT_MODES = ["in-person", "telehealth"] as const;
export const PAYMENT_METHODS = ["self-pay", "insurance"] as const;
export const STATUSES = ["scheduled", "checked-in", "completed", "cancelled", "no-show"] as const;

export type VisitType = (typeof VISIT_TYPES)[number];
export type VisitMode = (typeof VISIT_MODES)[number];
export type AppointmentStatus = (typeof STATUSES)[number];

export function visitDurationMinutes(type: VisitType): 30 | 60 {
  return type === "medication-management" ? 30 : 60;
}

/** Wall-clock `date` + `time` in the clinic's timezone, as an absolute instant. */
export function clinicStartsAt(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new TZDate(year, month - 1, day, hour, minute, CLINIC_TIME_ZONE);
}

/** UTC ISO string. `TZDate#toISOString` emits a local offset, which breaks string sorting. */
export const toUtcIso = (date: Date) => new Date(date.getTime()).toISOString();

const US_PHONE = /^1?[2-9]\d{2}[2-9]\d{6}$/;

export const patientSchema = z.object({
  firstName: z.string("First name is required").trim().min(1, "First name is required").max(100),
  lastName: z.string("Last name is required").trim().min(1, "Last name is required").max(100),
  dateOfBirth: z.iso
    .date("Enter a valid date of birth")
    .refine((dob) => differenceInYears(new Date(), parseISO(dob)) >= 18, "Patient must be 18 or older"),
  email: z.email("Enter a valid email"),
  phone: z
    .string("Enter a valid US phone number")
    .trim()
    .refine((value) => US_PHONE.test(value.replace(/\D/g, "")), "Enter a valid US phone number"),
});

export const visitSchema = z
  .object({
    type: z.enum(VISIT_TYPES, "Choose a visit type"),
    mode: z.enum(VISIT_MODES, "Choose a visit mode"),
    providerId: z.string("Choose a provider").min(1, "Choose a provider"),
    date: z.iso.date("Choose a date"),
    time: z.string("Choose a time").regex(/^([01]\d|2[0-3]):(00|30)$/, "Choose a time on a 30-minute slot"),
  })
  .superRefine(({ type, date, time }, ctx) => {
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);

    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Visits are only available on weekdays" });
    }

    const start = hour * 60 + minute;
    const end = start + visitDurationMinutes(type);
    if (start < OPEN_HOUR * 60 || end > CLOSE_HOUR * 60) {
      ctx.addIssue({ code: "custom", path: ["time"], message: "Visits must fall between 9:00 and 17:00" });
    }

    if (clinicStartsAt(date, time).getTime() <= Date.now()) {
      ctx.addIssue({ code: "custom", path: ["time"], message: "Choose a time in the future" });
    }
  });

export const paymentSchema = z.discriminatedUnion(
  "method",
  [
    z.object({ method: z.literal("self-pay") }),
    z.object({
      method: z.literal("insurance"),
      carrier: z.string("Insurance carrier is required").trim().min(1, "Insurance carrier is required"),
      memberId: z.string("Member ID is required").trim().min(1, "Member ID is required"),
      groupNumber: z.string().trim().optional(),
    }),
  ],
  "Choose a payment method",
);

export const bookingSchema = z.object({
  patient: patientSchema,
  visit: visitSchema,
  payment: paymentSchema,
});

export type Patient = z.infer<typeof patientSchema>;
export type Visit = z.infer<typeof visitSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Booking = z.infer<typeof bookingSchema>;

export const SORT_FIELDS = ["startsAt", "patient"] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;
export const MAX_PAGE_SIZE = 100;

export const appointmentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.array(z.enum(STATUSES)).default([]),
    providerId: z.string().min(1).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sortBy: z.enum(SORT_FIELDS).default("startsAt"),
    sortOrder: z.enum(SORT_ORDERS).default("asc"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "End date must be on or after start date" });

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const cancellationReasonSchema = z
  .string("Give a reason for cancelling")
  .trim()
  .min(10, "Reason must be at least 10 characters")
  .max(500);

export const statusUpdateSchema = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("cancelled"), cancellationReason: cancellationReasonSchema }),
    z.object({ status: z.enum(["checked-in", "completed", "no-show"]) }),
  ],
  "Choose a valid status",
);

export type StatusUpdate = z.infer<typeof statusUpdateSchema>;
