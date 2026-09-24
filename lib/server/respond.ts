import { NextResponse } from "next/server";
import type { z } from "zod";
import type { ApiFailure, ApiSuccess, FieldErrors } from "../api-type";

export function toFieldErrors(issues: readonly z.core.$ZodIssue[]) {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "root";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export const ok = <T>(data: T, status = 200, message = "OK") =>
  NextResponse.json<ApiSuccess<T>>({ success: true, message, data }, { status });

export const fail = <T = never>(
  message: string,
  status: number,
  extra: { errors?: FieldErrors; data?: T } = {},
) => NextResponse.json<ApiFailure<T>>({ success: false, message, ...extra }, { status });

export const simulatedFailure = () => fail("Simulated server error", 500);

/** Parsed body, or `undefined` for a missing or malformed one so the schema reports it as a field error. */
export const readJson = (req: Request): Promise<unknown> => req.json().catch(() => undefined);
