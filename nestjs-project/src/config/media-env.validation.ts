import * as Joi from 'joi';

export const mediaEnvValidationSchema = Joi.object({
  STORAGE_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://minio:9000'),
  STORAGE_SIGNING_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://minio:9000'),
  STORAGE_REGION: Joi.string().default('us-east-1'),
  STORAGE_BUCKET: Joi.string().min(3).default('streamtube'),
  STORAGE_ACCESS_KEY_ID: Joi.string().default('minioadmin'),
  STORAGE_SECRET_ACCESS_KEY: Joi.string().min(8).default('minioadmin'),
  STORAGE_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('true'),
  REDIS_HOST: Joi.string().invalid('localhost', '127.0.0.1').default('redis'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  QUEUE_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('streamtube'),
  VIDEO_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(1).default(1),
  VIDEO_FFMPEG_THREADS: Joi.number().integer().min(1).default(2),
  VIDEO_PROCESSING_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .default(3600000),
  VIDEO_TEMP_DIRECTORY: Joi.string()
    .pattern(/^\//)
    .default('/var/tmp/streamtube'),
  VIDEO_TEMP_BUDGET_BYTES: Joi.number()
    .integer()
    .min(10000000000)
    .default(25769803776),
  FFMPEG_PATH: Joi.string().default('/usr/bin/ffmpeg'),
  FFPROBE_PATH: Joi.string().default('/usr/bin/ffprobe'),
});
