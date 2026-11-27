import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { storageFixture, completedObject } from './storage-test.fixture';
import { storageKey } from './storage-key';

describe('Storage delivery integration', () => {
  let fixture: Awaited<ReturnType<typeof storageFixture>>;
  let key: string;
  const body = randomBytes(4096);
  beforeAll(async () => {
    fixture = await storageFixture();
    key = storageKey(randomUUID(), randomUUID(), 'playback');
    await completedObject(fixture.storage, key, body);
  });
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('keeps objects private without a signed authorization', async () => {
    const auth = await fixture.storage.authorizeRead(key);
    const url = new URL(auth.url);
    url.search = '';
    const response = await fetch(url);
    expect(response.status).toBe(403);
    await response.arrayBuffer();
  });

  it('returns 206 with exact bytes and Content-Range, and 416 for an invalid range', async () => {
    const auth = await fixture.storage.authorizeRead(key);
    const response = await fetch(auth.url, {
      headers: { Range: 'bytes=10-29' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(
      `bytes 10-29/${body.length}`,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      body.subarray(10, 30),
    );
    const invalid = await fetch(auth.url, {
      headers: { Range: `bytes=${body.length + 1}-` },
    });
    expect(invalid.status).toBe(416);
    await invalid.arrayBuffer();
  });

  it('signs the configured host and rejects tampering with the object or signature', async () => {
    const auth = await fixture.storage.authorizeRead(key);
    expect(new URL(auth.url).hostname).toBe('minio');
    const object = new URL(auth.url);
    object.pathname += '-other';
    const signature = new URL(auth.url);
    signature.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    for (const url of [object, signature]) {
      const response = await fetch(url);
      expect(response.status).toBe(403);
      await response.arrayBuffer();
    }
  });

  it('expires delivery authorization at the storage', async () => {
    const auth = await fixture.storage.authorizeRead(key, 1);
    await setTimeout(2200);
    const response = await fetch(auth.url);
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('expired');
  });

  it('returns signed UTF-8 attachment disposition and rejects override tampering', async () => {
    const auth = await fixture.storage.authorizeRead(
      key,
      900,
      'vídeo "original".mp4',
    );
    const response = await fetch(auth.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''v%C3%ADdeo%20%22original%22.mp4",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
    const tampered = new URL(auth.url);
    tampered.searchParams.set('response-content-disposition', 'inline');
    const denied = await fetch(tampered);
    expect(denied.status).toBe(403);
    await denied.arrayBuffer();
  });
});
