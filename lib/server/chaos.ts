import { SIMULATE_FAILURE_HEADER } from "../api-type";

export const randomLatency = () =>
  new Promise((r) => setTimeout(r, 300 + Math.random() * 600));

const FAILURE_RATE = 0.3;

export type ChaosOutcome = "ok" | "fail-before" | "fail-after";

export function rollChaos(request: Request, { isWrite }: { isWrite: boolean }): ChaosOutcome {
  if (request.headers.get(SIMULATE_FAILURE_HEADER) !== "1") return "ok";
  if (Math.random() >= FAILURE_RATE) return "ok";
  return isWrite && Math.random() < 0.5 ? "fail-after" : "fail-before";
}