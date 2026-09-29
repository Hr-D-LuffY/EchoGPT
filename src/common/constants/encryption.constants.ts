export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export const ENCRYPTION_KEY_BYTES = 32;

/** 96-bit IV — the recommended size for GCM. */
export const ENCRYPTION_IV_BYTES = 12;

export const ENCRYPTION_AUTH_TAG_BYTES = 16;

/**
 * Prefixed to every ciphertext so the format (or key) can be rotated later
 * without guessing how an existing value was produced.
 */
export const ENCRYPTION_FORMAT_VERSION = 'v1';
