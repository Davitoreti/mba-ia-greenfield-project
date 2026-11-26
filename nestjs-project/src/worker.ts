import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import processingConfig from './config/processing.config';
import { VIDEO_PROCESSING_QUEUE } from './queues/queues.constants';
import { WORKER_READY_FILE } from './video-worker.constants';
import { VideoWorkerModule } from './video-worker.module';

const executeFile = promisify(execFile);
const logger = new Logger('VideoWorker');

async function bootstrap(): Promise<void> {
  await rm(WORKER_READY_FILE, { force: true });
  const app = await NestFactory.createApplicationContext(VideoWorkerModule);
  app.enableShutdownHooks();
  const config = app.get<ConfigType<typeof processingConfig>>(
    processingConfig.KEY,
  );
  const queue = app.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));

  try {
    const options = { timeout: 10000, maxBuffer: 1024 * 1024 };
    const ffmpeg = await executeFile(config.ffmpegPath, ['-version'], options);
    const ffprobe = await executeFile(
      config.ffprobePath,
      ['-version'],
      options,
    );
    const encoders = await executeFile(
      config.ffmpegPath,
      ['-hide_banner', '-encoders'],
      options,
    );
    if (
      !/\blibx264\b/.test(encoders.stdout) ||
      !/\baac\b/.test(encoders.stdout)
    ) {
      throw new Error('Required H.264/AAC encoders unavailable');
    }
    await mkdir(config.temporaryDirectory, { recursive: true });
    await queue.waitUntilReady();
    await queue.getJobCounts();
    await writeFile(WORKER_READY_FILE, String(process.pid));
    logger.log(ffmpeg.stdout.split('\n')[0]);
    logger.log(ffprobe.stdout.split('\n')[0]);
    logger.log('H.264 (libx264) and AAC encoders available');
    logger.log(
      `Infrastructure ready; concurrency=${config.concurrency}, threads=${config.threads}, timeoutMs=${config.timeoutMs}, temporaryBudgetBytes=${config.temporaryBudgetBytes}. No HTTP listener. Job consumer is delivered in SI-03.5.1.`,
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch(() => {
  logger.error(
    'Worker infrastructure bootstrap failed; check configuration, Redis and media binaries.',
  );
  process.exitCode = 1;
});
