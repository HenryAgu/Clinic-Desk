/** Wire types shared by the route handlers and the client. */

/** Keyed by dotted field path (`visit.time`), matching React Hook Form names. `root` for form-level errors. */
export type FieldErrors = Record<string, string[]>;

export type ApiSuccess<T> = { success: true; message: string; data: T };

export type ApiFailure<T = never> = {
  success: false;
  message: string;
  errors?: FieldErrors;
  /** Current server state, when it helps the client recover (e.g. on a 409 status change). */
  data?: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure<T>;

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

export type Paginated<T> = { content: T[]; pagination: Pagination };

export const SIMULATE_FAILURE_HEADER = "x-simulate-failure";
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
