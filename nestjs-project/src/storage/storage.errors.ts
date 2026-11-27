export class StorageError extends Error {
  constructor(
    public readonly code:
      | 'STORAGE_UNAVAILABLE'
      | 'UPLOAD_INTEGRITY_MISMATCH'
      | 'UPLOAD_PARTS_INVALID'
      | 'UPLOAD_NOT_FOUND',
  ) {
    super(code);
    this.name = 'StorageError';
  }
}
