import { faker } from "@faker-js/faker";
import { TZDate } from "@date-fns/tz";
import { addDays, format, isSameDay, isWeekend, subDays } from "date-fns";
import type { Appointment, AppointmentStatus, Insurance, Provider } from "../domain";
import {
  CLINIC_TIME_ZONE,
  CLOSE_HOUR,
  OPEN_HOUR,
  SLOT_MINUTES,
  VISIT_MODES,
  VISIT_TYPES,
  visitDurationMinutes,
} from "../schema";

const SEED = 20260923;
const PROVIDER_COUNT = 6;
const APPOINTMENT_COUNT = 160;
const DAY_RANGE = 30;

const SPECIALTIES = ["Psychiatry", "Family Medicine", "Internal Medicine", "Clinical Psychology"];
const CARRIERS = ["Aetna", "Blue Cross Blue Shield", "Cigna", "UnitedHealthcare", "Humana", "Kaiser Permanente"];
const CANCELLATION_REASONS = [
  "Patient requested to reschedule",
  "Provider unavailable that day",
  "Patient no longer needs the visit",
  "Insurance authorization not received",
];

function usPhone() {
  const area = faker.number.int({ min: 201, max: 989 });
  const exchange = faker.number.int({ min: 200, max: 999 });
  return `(${area}) ${exchange}-${faker.string.numeric(4)}`;
}

function insurance(): Insurance | null {
  if (faker.datatype.boolean(0.3)) return null;
  return {
    carrier: faker.helpers.arrayElement(CARRIERS),
    memberId: faker.string.alphanumeric({ length: 9, casing: "upper" }),
    groupNumber: faker.helpers.maybe(() => faker.string.numeric(6), { probability: 0.6 }) ?? null,
  };
}

function status(startsAt: Date, now: Date): AppointmentStatus {
  if (startsAt.getTime() >= now.getTime()) {
    return faker.helpers.weightedArrayElement([
      { value: "scheduled", weight: 85 },
      { value: "cancelled", weight: 15 },
    ]);
  }
  // Earlier today: the patient may still be in the building.
  if (isSameDay(new TZDate(startsAt, CLINIC_TIME_ZONE), new TZDate(now, CLINIC_TIME_ZONE))) {
    return faker.helpers.weightedArrayElement([
      { value: "checked-in", weight: 50 },
      { value: "completed", weight: 40 },
      { value: "no-show", weight: 10 },
    ]);
  }
  return faker.helpers.weightedArrayElement([
    { value: "completed", weight: 75 },
    { value: "no-show", weight: 10 },
    { value: "cancelled", weight: 15 },
  ]);
}

export function seedData(now = new Date()) {
  faker.seed(SEED);

  const providers: Provider[] = Array.from({ length: PROVIDER_COUNT }, (_, i) => ({
    id: `prv_${i + 1}`,
    name: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
    specialty: faker.helpers.arrayElement(SPECIALTIES),
  }));

  const today = new TZDate(now, CLINIC_TIME_ZONE);
  const taken = new Set<string>();
  const appointments: Appointment[] = [];

  while (appointments.length < APPOINTMENT_COUNT) {
    const day = addDays(today, faker.number.int({ min: -DAY_RANGE, max: DAY_RANGE }));
    if (isWeekend(day)) continue;

    const visitType = faker.helpers.arrayElement(VISIT_TYPES);
    const duration = visitDurationMinutes(visitType);
    const lastStart = CLOSE_HOUR * 60 - duration;
    const start = OPEN_HOUR * 60 + SLOT_MINUTES * faker.number.int({ max: (lastStart - OPEN_HOUR * 60) / SLOT_MINUTES });
    const provider = faker.helpers.arrayElement(providers);
    const date = format(day, "yyyy-MM-dd");

    const slotKeys = Array.from(
      { length: duration / SLOT_MINUTES },
      (_, i) => `${provider.id}|${date}|${start + i * SLOT_MINUTES}`,
    );
    if (slotKeys.some((key) => taken.has(key))) continue;
    slotKeys.forEach((key) => taken.add(key));

    const startsAt = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, start, CLINIC_TIME_ZONE);
    const apptStatus = status(startsAt, now);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    appointments.push({
      id: faker.string.uuid(),
      patient: {
        firstName,
        lastName,
        dateOfBirth: format(faker.date.birthdate({ mode: "age", min: 18, max: 85, refDate: now }), "yyyy-MM-dd"),
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        phone: usPhone(),
      },
      providerId: provider.id,
      visitType,
      mode: faker.helpers.arrayElement(VISIT_MODES),
      startsAt: startsAt.toISOString(),
      durationMinutes: duration,
      status: apptStatus,
      insurance: insurance(),
      cancellationReason: apptStatus === "cancelled" ? faker.helpers.arrayElement(CANCELLATION_REASONS) : null,
      createdAt: subDays(startsAt, faker.number.int({ min: 1, max: 21 })).toISOString(),
    });
  }

  return { providers, appointments };
}
