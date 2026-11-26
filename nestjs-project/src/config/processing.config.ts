import { registerAs } from '@nestjs/config';

export default registerAs('processing', () => ({
  concurrency: Number(process.env.VIDEO_WORKER_CONCURRENCY ?? 1),
  threads: Number(process.env.VIDEO_FFMPEG_THREADS ?? 2),
  timeoutMs: Number(process.env.VIDEO_PROCESSING_TIMEOUT_MS ?? 3600000),
  temporaryDirectory: process.env.VIDEO_TEMP_DIRECTORY ?? '/var/tmp/streamtube',
  temporaryBudgetBytes: Number(
    process.env.VIDEO_TEMP_BUDGET_BYTES ?? 25769803776,
  ),
  ffmpegPath: process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? '/usr/bin/ffprobe',
}));
