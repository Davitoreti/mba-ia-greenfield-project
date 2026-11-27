import { randomUUID, createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { STORAGE, type StoragePort, type StoredPart } from './storage.port';

export const sha256 = (body: Uint8Array): string =>
  createHash('sha256').update(body).digest('base64');
export const compositeSHA256 = (parts: string[]): string =>
  `${sha256(Buffer.concat(parts.map((part) => Buffer.from(part, 'base64'))))}-${parts.length}`;

export async function storageFixture(): Promise<{
  module: TestingModule;
  storage: StoragePort;
  client: S3Client;
  bucket: string;
  cleanup: () => Promise<void>;
}> {
  const config = { ...storageConfig(), bucket: `si0311-${randomUUID()}` };
  if (
    new URL(config.endpoint).hostname !== 'minio' ||
    new URL(config.signingEndpoint).hostname !== 'minio'
  )
    throw new Error(
      'Storage integration tests require the Compose minio service',
    );
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const module = await Test.createTestingModule({ imports: [StorageModule] })
    .overrideProvider(storageConfig.KEY)
    .useValue(config)
    .compile();
  await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  return {
    module,
    storage: module.get<StoragePort>(STORAGE),
    client,
    bucket: config.bucket,
    cleanup: async () => {
      try {
        const uploads = await client.send(
          new ListMultipartUploadsCommand({ Bucket: config.bucket }),
        );
        for (const upload of uploads.Uploads ?? [])
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket: config.bucket,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          );
        const objects = await client.send(
          new ListObjectsV2Command({ Bucket: config.bucket }),
        );
        for (const object of objects.Contents ?? [])
          await client.send(
            new DeleteObjectCommand({ Bucket: config.bucket, Key: object.Key }),
          );
        await client.send(new DeleteBucketCommand({ Bucket: config.bucket }));
      } finally {
        client.destroy();
        await module.close();
      }
    },
  };
}

export async function uploadPart(
  storage: StoragePort,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<void> {
  const authorization = await storage.authorizePart(
    key,
    uploadId,
    partNumber,
    sha256(body),
  );
  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: authorization.headers,
    body: new Uint8Array(body),
  });
  if (!response.ok)
    throw new Error(
      `Part upload failed: ${response.status} ${await response.text()}`,
    );
  await response.arrayBuffer();
}

export async function completedObject(
  storage: StoragePort,
  key: string,
  body: Uint8Array,
): Promise<StoredPart[]> {
  const uploadId = await storage.initiate(key, 'video/mp4');
  await uploadPart(storage, key, uploadId, 1, body);
  const { parts } = await storage.listParts(key, uploadId);
  await storage.complete(
    key,
    uploadId,
    parts,
    compositeSHA256(parts.map((part) => part.checksumSHA256)),
  );
  return parts;
}
