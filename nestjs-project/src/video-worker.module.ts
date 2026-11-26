import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from './config/storage.config';
import queueConfig from './config/queue.config';
import processingConfig from './config/processing.config';
import { mediaEnvValidationSchema } from './config/media-env.validation';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [storageConfig, queueConfig, processingConfig],
      validationSchema: mediaEnvValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    QueuesModule,
  ],
})
export class VideoWorkerModule {}
