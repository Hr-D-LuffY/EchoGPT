import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_AUTH_TAG_BYTES,
  ENCRYPTION_FORMAT_VERSION,
  ENCRYPTION_IV_BYTES,
  ENCRYPTION_KEY_BYTES,
} from '../constants/encryption.constants';

/**
 * AES-256-GCM encryption for secrets at rest (AI provider API keys).
 * Output format: `v1:<iv>:<authTag>:<ciphertext>`, each part base64.
 * GCM's auth tag means a tampered ciphertext fails to decrypt instead of
 * silently producing garbage.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    this.key = Buffer.from(
      configService.getOrThrow<string>('encryption.providerKeySecret'),
      'hex',
    );
    if (this.key.length !== ENCRYPTION_KEY_BYTES) {
      throw new Error(
        `Encryption key must be ${ENCRYPTION_KEY_BYTES} bytes, got ${this.key.length}`,
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(ENCRYPTION_IV_BYTES);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.key, iv, {
      authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
    });
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      ENCRYPTION_FORMAT_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, authTag, ciphertext] = payload.split(':');
    if (
      version !== ENCRYPTION_FORMAT_VERSION ||
      !iv ||
      !authTag ||
      !ciphertext
    ) {
      throw new Error('Unrecognized encrypted payload format');
    }

    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      this.key,
      Buffer.from(iv, 'base64'),
      { authTagLength: ENCRYPTION_AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
