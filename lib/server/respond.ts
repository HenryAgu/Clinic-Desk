import { NextResponse } from "next/server";
import type { z } from "zod";

export function toFieldErrors(issues: readonly z.core.$ZodIssue[]) {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "root";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export const ok = <T>(data: T, status = 200, message = "OK") =>
  NextResponse.json({ success: true, message, data }, { status });

export const fail = (message: string, status: number, errors?: Record<string, string[]>) =>
  NextResponse.json({ success: false, message, ...(errors && { errors }) }, { status });