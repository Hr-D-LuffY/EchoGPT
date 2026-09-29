import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  DATABASE_URL: Joi.string().uri().required(),
  CORS_ORIGIN: Joi.string().default('*'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // 32-byte AES-256 key, hex-encoded. Generate with:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  PROVIDER_KEY_ENCRYPTION_SECRET: Joi.string()
    .hex()
    .length(64)
    .required()
    .messages({
      'string.length':
        'PROVIDER_KEY_ENCRYPTION_SECRET must be 64 hex characters (32 bytes)',
    }),
});
