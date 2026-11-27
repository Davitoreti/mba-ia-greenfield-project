import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE } from './storage.port';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [
    S3StorageAdapter,
    { provide: STORAGE, useExisting: S3StorageAdapter },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
