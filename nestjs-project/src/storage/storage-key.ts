export function storageKey(
  channelId: string,
  videoId: string,
  category: 'original' | 'playback' | 'thumbnail',
  generation = 1,
): string {
  const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
  if (
    !identifier.test(channelId) ||
    !identifier.test(videoId) ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error('Invalid internal storage identity');
  }
  return `channels/${channelId}/videos/${videoId}/${category}/${generation}`;
}
