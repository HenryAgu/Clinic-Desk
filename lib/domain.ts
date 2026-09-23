export const STATUSES = ["scheduled", "checked-in", "completed", "cancelled", "no-show"] as const;
export type AppointmentStatus = (typeof STATUSES)[number];

export const STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["checked-in", "no-show", "cancelled"],
  "checked-in": ["completed", "cancelled"],
  completed: [], cancelled: [], "no-show": [],
};