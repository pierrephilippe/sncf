export type AppErrorCode =
  | "bad_request"
  | "configuration"
  | "external_api"
  | "not_found"
  | "timeout"
  | "validation";

export type AppError = {
  code: AppErrorCode;
  message: string;
  status: number;
  details?: unknown;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (
  code: AppErrorCode,
  message: string,
  status = 500,
  details?: unknown,
): Result<never> => ({
  ok: false,
  error: { code, message, status, details },
});
