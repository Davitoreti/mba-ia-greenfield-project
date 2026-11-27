import { randomBytes, randomUUID } from 'node:crypto';
import { ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
import {
  storageFixture,
  sha256,
  compositeSHA256,
  uploadPart,
} from './storage-test.fixture';
import { storageKey } from './storage-key';

describe('Storage multipart integration', () => {
  jest.setTimeout(30000);
  let fixture: Awaited<ReturnType<typeof storageFixture>>;
  beforeAll(async () => {
    fixture = await storageFixture();
  });
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('completes intact parts and verifies the stored composite checksum and exact bytes', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const bodies = [randomBytes(5 * 1024 * 1024), randomBytes(1024)];
    const id = await fixture.storage.initiate(key, 'video/mp4');
    for (const [index, body] of bodies.entries())
      await uploadPart(fixture.storage, key, id, index + 1, body);
    const { parts } = await fixture.storage.listParts(key, id);
    expect(parts.map((part) => part.checksumSHA256)).toEqual(
      bodies.map(sha256),
    );
    const checksum = compositeSHA256(bodies.map(sha256));
    const metadata = await fixture.storage.complete(key, id, parts, checksum);
    expect(metadata).toMatchObject({
      sizeBytes: bodies[0].length + bodies[1].length,
      checksumSHA256: checksum,
      checksumType: 'COMPOSITE',
    });
    const read = await fixture.storage.authorizeRead(key);
    const response = await fetch(read.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.concat(bodies),
    );
    await fixture.storage.remove(key);
    await fixture.storage.remove(key);
    expect(await fixture.storage.head(key)).toBeNull();
  });

  it('retrieves all parts with an actual paginated list and aborts idempotently', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const id = await fixture.storage.initiate(key, 'video/mp4');
    for (let number = 1; number <= 3; number++)
      await uploadPart(fixture.storage, key, id, number, randomBytes(128));
    const numbers: number[] = [];
    let marker: number | undefined;
    do {
      const page = await fixture.storage.listParts(key, id, marker, 1);
      expect(page.parts).toHaveLength(1);
      numbers.push(...page.parts.map((part) => part.partNumber));
      marker = page.nextPartNumberMarker;
    } while (marker !== undefined);
    expect(numbers).toEqual([1, 2, 3]);
    await fixture.storage.abort(key, id);
    await fixture.storage.abort(key, id);
    await expect(fixture.storage.listParts(key, id)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
    });
    const active = await fixture.client.send(
      new ListMultipartUploadsCommand({ Bucket: fixture.bucket }),
    );
    expect(
      active.Uploads?.some((upload) => upload.UploadId === id) ?? false,
    ).toBe(false);
  });

  it('rejects corrupted bytes with the signed checksum and accepts no object', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const id = await fixture.storage.initiate(key, 'video/mp4');
    const body = randomBytes(512);
    const auth = await fixture.storage.authorizePart(key, id, 1, sha256(body));
    body[0] ^= 255;
    const response = await fetch(auth.url, {
      method: 'PUT',
      headers: auth.headers,
      body: new Uint8Array(body),
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('XAmzContentChecksumMismatch');
    expect((await fixture.storage.listParts(key, id)).parts).toHaveLength(0);
    expect(await fixture.storage.head(key)).toBeNull();
    await fixture.storage.abort(key, id);
  });

  it('rejects a divergent object checksum at completion without accepting an object', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const id = await fixture.storage.initiate(key, 'video/mp4');
    await uploadPart(fixture.storage, key, id, 1, randomBytes(256));
    const { parts } = await fixture.storage.listParts(key, id);
    await expect(
      fixture.storage.complete(
        key,
        id,
        parts,
        compositeSHA256([sha256(randomBytes(256))]),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_INTEGRITY_MISMATCH' });
    expect(await fixture.storage.head(key)).toBeNull();
    await fixture.storage.abort(key, id);
  });

  it('rejects missing or modified signed checksum headers', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const id = await fixture.storage.initiate(key, 'video/mp4');
    const body = randomBytes(128);
    const auth = await fixture.storage.authorizePart(key, id, 1, sha256(body));
    const headerVariants: {
      headers: Record<string, string>;
      status: number;
      code: string;
    }[] = [
      { headers: {}, status: 400, code: 'AccessDenied' },
      {
        headers: { 'x-amz-checksum-sha256': sha256(randomBytes(128)) },
        status: 403,
        code: 'SignatureDoesNotMatch',
      },
    ];
    for (const { headers, status, code } of headerVariants) {
      const response = await fetch(auth.url, {
        method: 'PUT',
        headers,
        body: new Uint8Array(body),
      });
      expect(response.status).toBe(status);
      expect(await response.text()).toContain(`<Code>${code}</Code>`);
    }
    expect((await fixture.storage.listParts(key, id)).parts).toHaveLength(0);
    await fixture.storage.abort(key, id);
  });

  it('returns CORS upload permission and exposes ETag and checksum to browser clients', async () => {
    const key = storageKey(randomUUID(), randomUUID(), 'original');
    const id = await fixture.storage.initiate(key, 'video/mp4');
    const body = randomBytes(128);
    const auth = await fixture.storage.authorizePart(key, id, 1, sha256(body));
    const preflight = await fetch(auth.url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://streamtube.test',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'x-amz-checksum-sha256',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    );
    expect(
      preflight.headers.get('access-control-allow-headers')?.toLowerCase(),
    ).toContain('x-amz-checksum-sha256');
    await preflight.arrayBuffer();
    const response = await fetch(auth.url, {
      method: 'PUT',
      headers: { ...auth.headers, Origin: 'http://streamtube.test' },
      body: new Uint8Array(body),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBeTruthy();
    const exposed = response.headers
      .get('access-control-expose-headers')
      ?.toLowerCase();
    expect(exposed).toContain('etag');
    // Fetch without credentials: a literal '*' exposes all response headers.
    expect(exposed?.split(',').map((header) => header.trim())).toContain('*');
    expect(response.headers.get('x-amz-checksum-sha256')).toBe(sha256(body));
    await response.arrayBuffer();
    await fixture.storage.abort(key, id);
  });

  it('rejects paths derived from unsafe identities', () => {
    expect(() => storageKey('../other', randomUUID(), 'original')).toThrow(
      'Invalid internal storage identity',
    );
  });
});
