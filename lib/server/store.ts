import type { Appointment, Provider } from "../domain";
import { seedData } from "./seed";

type Db = { providers: Provider[]; appointments: Appointment[] };

const createDb = (): Db => seedData();

const g = globalThis as unknown as { __db?: Db };
export const db = () => (g.__db ??= createDb());
