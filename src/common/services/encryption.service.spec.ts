import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

function buildService(secretHex = randomBytes(32).toString('hex')) {
  return new EncryptionService({
    getOrThrow: () => secretHex,
  } as unknown as ConfigService);
}

describe('EncryptionService', () => {
  const plaintext = 'sk-proj-super-secret-key-1234';

  it('round-trips a value', () => {
    const service = buildService();
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it('never stores the plaintext and uses a fresh IV each time', () => {
    const service = buildService();
    const first = service.encrypt(plaintext);
    const second = service.encrypt(plaintext);

    expect(first).not.toContain(plaintext);
    expect(first).not.toBe(second);
    expect(first.startsWith('v1:')).toBe(true);
  });

  it('rejects a tampered ciphertext', () => {
    const service = buildService();
    const [version, iv, tag, ciphertext] = service
      .encrypt(plaintext)
      .split(':');
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;

    expect(() =>
      service.decrypt([version, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
  });

  it('cannot decrypt with a different key', () => {
    const encrypted = buildService().encrypt(plaintext);
    expect(() => buildService().decrypt(encrypted)).toThrow();
  });

  it('rejects an unknown payload format', () => {
    expect(() => buildService().decrypt('not-encrypted')).toThrow(
      'Unrecognized encrypted payload format',
    );
  });

  it('refuses a key of the wrong length at construction', () => {
    expect(() => buildService('abcd')).toThrow(/must be 32 bytes/);
  });
});
