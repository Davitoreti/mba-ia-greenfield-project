import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  S3Client,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../config/storage.config';
import type {
  StoragePort,
  StoredPart,
  ObjectMetadata,
  StorageAuthorization,
} from './storage.port';
import { StorageError } from './storage.errors';

@Injectable()
export class S3StorageAdapter implements StoragePort, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    const options = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ ...options, endpoint: config.endpoint });
    this.signingClient = new S3Client({
      ...options,
      endpoint: config.signingEndpoint,
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.signingClient.destroy();
  }

  async initiate(key: string, contentType: string): Promise<string> {
    return await this.execute(async () => {
      const result = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          ContentType: contentType,
          ChecksumAlgorithm: 'SHA256',
          ChecksumType: 'COMPOSITE',
        }),
      );
      if (!result.UploadId) throw new StorageError('STORAGE_UNAVAILABLE');
      return result.UploadId;
    });
  }

  async listParts(
    key: string,
    uploadId: string,
    marker?: number,
    limit = 1000,
  ): Promise<{ parts: StoredPart[]; nextPartNumberMarker?: number }> {
    return await this.execute(async () => {
      const result = await this.client.send(
        new ListPartsCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker === undefined ? undefined : String(marker),
          MaxParts: limit,
        }),
      );
      const parts = (result.Parts ?? []).map((part) => {
        if (
          part.PartNumber === undefined ||
          part.Size === undefined ||
          !part.ETag ||
          !part.ChecksumSHA256
        )
          throw new StorageError('UPLOAD_INTEGRITY_MISMATCH');
        return {
          partNumber: part.PartNumber,
          sizeBytes: part.Size,
          etag: part.ETag,
          checksumSHA256: part.ChecksumSHA256,
        };
      });
      return {
        parts,
        nextPartNumberMarker: result.IsTruncated
          ? Number(result.NextPartNumberMarker)
          : undefined,
      };
    });
  }

  async authorizePart(
    key: string,
    uploadId: string,
    partNumber: number,
    checksumSHA256: string,
    expiresIn = 900,
  ): Promise<StorageAuthorization> {
    if (
      !/^[A-Za-z0-9+/]{43}=$/.test(checksumSHA256) ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000
    )
      throw new StorageError('UPLOAD_PARTS_INVALID');
    this.validateExpiry(expiresIn);
    return await this.execute(async () => ({
      url: await getSignedUrl(
        this.signingClient,
        new UploadPartCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ChecksumSHA256: checksumSHA256,
        }),
        { expiresIn, unhoistableHeaders: new Set(['x-amz-checksum-sha256']) },
      ),
      headers: { 'x-amz-checksum-sha256': checksumSHA256 },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }));
  }

  async complete(
    key: string,
    uploadId: string,
    parts: Pick<StoredPart, 'partNumber' | 'etag' | 'checksumSHA256'>[],
    checksumSHA256: string,
  ): Promise<ObjectMetadata> {
    return await this.execute(async () => {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          ChecksumType: 'COMPOSITE',
          ChecksumSHA256: checksumSHA256,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
              ChecksumSHA256: part.checksumSHA256,
            })),
          },
        }),
      );
      const metadata = await this.head(key);
      if (
        !metadata ||
        metadata.checksumSHA256 !== checksumSHA256 ||
        metadata.checksumType !== 'COMPOSITE'
      )
        throw new StorageError('UPLOAD_INTEGRITY_MISMATCH');
      return metadata;
    });
  }

  async abort(key: string, uploadId: string): Promise<void> {
    await this.execute(async () => {
      try {
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        );
      } catch (error) {
        if (
          !(
            error instanceof S3ServiceException && error.name === 'NoSuchUpload'
          )
        )
          throw error;
      }
    });
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    return await this.execute(async () => {
      try {
        const result = await this.client.send(
          new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            ChecksumMode: 'ENABLED',
          }),
        );
        if (result.ContentLength === undefined || !result.ETag)
          throw new StorageError('STORAGE_UNAVAILABLE');
        return {
          sizeBytes: result.ContentLength,
          etag: result.ETag,
          checksumSHA256: result.ChecksumSHA256,
          checksumType: result.ChecksumType,
        };
      } catch (error) {
        if (
          error instanceof S3ServiceException &&
          error.$metadata.httpStatusCode === 404
        )
          return null;
        throw error;
      }
    });
  }

  async remove(key: string): Promise<void> {
    await this.execute(async () => {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    });
  }

  async authorizeRead(
    key: string,
    expiresIn = 900,
    filename?: string,
  ): Promise<StorageAuthorization> {
    this.validateExpiry(expiresIn);
    const disposition =
      filename === undefined
        ? undefined
        : `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(
            Array.from(filename)
              .filter(
                (char) =>
                  char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
              )
              .join(''),
          ).replace(
            /['()*]/g,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
          )}`;
    return await this.execute(async () => ({
      url: await getSignedUrl(
        this.signingClient,
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          ResponseContentDisposition: disposition,
        }),
        { expiresIn },
      ),
      headers: {},
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }));
  }

  private validateExpiry(seconds: number): void {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
      throw new StorageError('UPLOAD_PARTS_INVALID');
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if (error instanceof S3ServiceException) {
        if (
          [
            'BadDigest',
            'XAmzContentChecksumMismatch',
            'XAmzContentSHA256Mismatch',
            'ChecksumMismatch',
          ].includes(error.name)
        )
          throw new StorageError('UPLOAD_INTEGRITY_MISMATCH');
        if (
          ['InvalidPart', 'InvalidPartOrder', 'EntityTooSmall'].includes(
            error.name,
          )
        )
          throw new StorageError('UPLOAD_PARTS_INVALID');
        if (error.name === 'NoSuchUpload')
          throw new StorageError('UPLOAD_NOT_FOUND');
      }
      throw new StorageError('STORAGE_UNAVAILABLE');
    }
  }
}
