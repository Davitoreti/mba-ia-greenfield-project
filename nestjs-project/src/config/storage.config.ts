import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  signingEndpoint: process.env.STORAGE_SIGNING_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.STORAGE_BUCKET ?? 'streamtube',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'minioadmin',
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
}));
