import { faker } from "@faker-js/faker";
import { TZDate } from "@date-fns/tz";
import { addDays, format, isWeekend, subDays } from "date-fns";
import type { Appointment, AppointmentStatus, Provider } from "../domain";
import {
  CLINIC_TIME_ZONE,
  CLOSE_HOUR,
  OPEN_HOUR,
  SLOT_MINUTES,
  VISIT_MODES,
  VISIT_TYPES,
  visitDurationMinutes,
  type Payment,
} from "../schema";

const SEED = 20260923;
const PROVIDER_COUNT = 6;
const APPOINTMENT_COUNT = 160;
const DAY_RANGE = 30;

const SPECIALTIES = ["Psychiatry", "Family Medicine", "Internal Medicine", "Clinical Psychology"];
const CARRIERS = ["Aetna", "Blue Cross Blue Shield", "Cigna", "UnitedHealthcare", "Humana", "Kaiser Permanente"];

const pad = (n: number) => String(n).padStart(2, "0");

function usPhone() {
  const area = faker.number.int({ min: 201, max: 989 });
  const exchange = faker.number.int({ min: 200, max: 999 });
  return `(${area}) ${exchange}-${faker.string.numeric(4)}`;
}

function payment(): Payment {
  if (faker.datatype.boolean(0.3)) return { method: "self-pay" };
  return {
    method: "insurance",
    carrier: faker.helpers.arrayElement(CARRIERS),
    memberId: faker.string.alphanumeric({ length: 9, casing: "upper" }),
    groupNumber: faker.helpers.maybe(() => faker.string.numeric(6), { probability: 0.6 }),
  };
}

function status(isPast: boolean): AppointmentStatus {
  return isPast
    ? faker.helpers.weightedArrayElement([
        { value: "completed", weight: 75 },
        { value: "no-show", weight: 10 },
        { value: "cancelled", weight: 15 },
      ])
    : faker.helpers.weightedArrayElement([
        { value: "scheduled", weight: 85 },
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

    const type = faker.helpers.arrayElement(VISIT_TYPES);
    const duration = visitDurationMinutes(type);
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
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    appointments.push({
      id: faker.string.uuid(),
      status: status(startsAt.getTime() < now.getTime()),
      createdAt: subDays(startsAt, faker.number.int({ min: 1, max: 21 })).toISOString(),
      patient: {
        firstName,
        lastName,
        dateOfBirth: format(faker.date.birthdate({ mode: "age", min: 18, max: 85, refDate: now }), "yyyy-MM-dd"),
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        phone: usPhone(),
      },
      visit: {
        type,
        mode: faker.helpers.arrayElement(VISIT_MODES),
        providerId: provider.id,
        date,
        time: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`,
      },
      payment: payment(),
    });
  }

  appointments.sort((a, b) => `${a.visit.date}${a.visit.time}`.localeCompare(`${b.visit.date}${b.visit.time}`));
  return { providers, appointments };
}
