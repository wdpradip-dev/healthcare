/**
 * Canonical error code registry — mirrors docs/28-ERROR-HANDLING.md exactly.
 * That document is the source of truth: add a code there first, then here.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: { httpStatus: 400 },
  AUTH_INVALID_CREDENTIALS: { httpStatus: 401 },
  AUTH_SESSION_EXPIRED: { httpStatus: 401 },
  AUTH_ACCOUNT_LOCKED: { httpStatus: 423 },
  AUTH_ACCOUNT_DISABLED: { httpStatus: 403 },
  AUTH_ACCOUNT_PENDING_ACTIVATION: { httpStatus: 403 },
  AUTH_HOSPITAL_SUSPENDED: { httpStatus: 403 },
  AUTH_ACTIVATION_TOKEN_INVALID: { httpStatus: 400 },
  AUTH_REFRESH_TOKEN_REUSED: { httpStatus: 401 },
  AUTH_OTP_INVALID: { httpStatus: 400 },
  AUTH_OTP_EXPIRED: { httpStatus: 400 },
  AUTH_OTP_MAX_ATTEMPTS: { httpStatus: 429 },
  AUTH_EMAIL_ALREADY_EXISTS: { httpStatus: 409 },
  FORBIDDEN: { httpStatus: 403 },
  NOT_FOUND: { httpStatus: 404 },
  APPOINTMENT_CONFLICT: { httpStatus: 409 },
  APPOINTMENT_NOT_AVAILABLE: { httpStatus: 422 },
  APPOINTMENT_CANCELLED: { httpStatus: 422 },
  REPORT_ACCESS_DENIED: { httpStatus: 403 },
  FILE_TOO_LARGE: { httpStatus: 413 },
  INVALID_FILE_TYPE: { httpStatus: 415 },
  RATE_LIMITED: { httpStatus: 429 },
  TENANT_MISMATCH: { httpStatus: 404 },
  INTERNAL_ERROR: { httpStatus: 500 },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function httpStatusForErrorCode(code: ErrorCode): number {
  return ERROR_CODES[code].httpStatus;
}
