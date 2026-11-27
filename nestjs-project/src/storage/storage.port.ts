export const STORAGE = Symbol('STORAGE');

export interface StoredPart {
  partNumber: number;
  etag: string;
  sizeBytes: number;
  checksumSHA256: string;
}

export interface ObjectMetadata {
  sizeBytes: number;
  etag: string;
  checksumSHA256?: string;
  checksumType?: string;
}

export interface StorageAuthorization {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoragePort {
  initiate(key: string, contentType: string): Promise<string>;
  listParts(
    key: string,
    uploadId: string,
    marker?: number,
    limit?: number,
  ): Promise<{
    parts: StoredPart[];
    nextPartNumberMarker?: number;
  }>;
  authorizePart(
    key: string,
    uploadId: string,
    partNumber: number,
    checksumSHA256: string,
    expiresIn?: number,
  ): Promise<StorageAuthorization>;
  complete(
    key: string,
    uploadId: string,
    parts: Pick<StoredPart, 'partNumber' | 'etag' | 'checksumSHA256'>[],
    checksumSHA256: string,
  ): Promise<ObjectMetadata>;
  abort(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<ObjectMetadata | null>;
  remove(key: string): Promise<void>;
  authorizeRead(
    key: string,
    expiresIn?: number,
    filename?: string,
  ): Promise<StorageAuthorization>;
}
