const ONE_MINUTE_MS = 60_000;

/** Global per-client limit applied to every route by ThrottlerGuard. */
export const THROTTLE_DEFAULT = { ttl: ONE_MINUTE_MS, limit: 100 };

/** Tighter limit for credential endpoints (register/login) against brute force. */
export const THROTTLE_AUTH = { ttl: ONE_MINUTE_MS, limit: 5 };
