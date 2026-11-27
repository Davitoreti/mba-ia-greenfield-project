# Storage compatibility — SI-03.1.1

## Scope and versions

Local verification uses MinIO AIStor Free RELEASE.2026-09-19T17-05-25Z,
image digest `sha256:107cf2014a9583c74c11e3cdbd6903d89c2244355886b89ce532f4ecae9c23f3`,
and `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` **3.1153.0**.
Tests run in the API container against the Compose `minio` service. AWS S3
has **not** been exercised; run the equivalent compatibility checks against
the deployment provider before claiming production compatibility.

Context7 returned the versioned SDK presigner documentation. S3 protocol
documentation was current, without an SDK-version-specific index. Installed
SDK types and the actual MinIO responses were checked together.

## Integrity contract

Use **SHA256 / COMPOSITE** for multipart. Each part's `checksumSHA256` is the
base64 SHA-256 digest of that part's exact bytes. Initiation sends
`ChecksumAlgorithm=SHA256` and `ChecksumType=COMPOSITE`.

The complete object's checksum is:

```text
base64(SHA256(binary(part1 SHA256) || binary(part2 SHA256) || ...)) + '-' + N
```

`N` is the number of parts in consecutive part-number order. This is a
checksum of checksums, **not** the direct SHA-256 digest of the entire file,
and the multipart ETag is not used as an integrity hash.

The client supplies a checksum for each part before authorization. The
presigner keeps `x-amz-checksum-sha256` in the signed headers through
`unhoistableHeaders`. A direct PUT must send the exact returned headers;
the URL host must never be rewritten. Use `credentials: 'omit'` for browser
fetches to storage; cookies/JWT are not needed by a signed capability.

Completion supplies ordered part number, ETag, part checksum and expected
composite checksum to the storage. The adapter requests checksum-enabled
HEAD and verifies the stored composite value/type after completion. Upload
services must additionally compare the authoritative part list, size and
declared integrity before persisting acceptance/outbox. Those workflows are
later SIs; this adapter alone does not enqueue or accept a video.

## Observed provider behavior

| Check | Observed result |
| --- | --- |
| Two intact parts, first 5 MiB | Completion succeeds; HEAD returns exact size, composite SHA256 and COMPOSITE; GET bytes match |
| Actual ListParts pagination (`MaxParts=1`) | All three part numbers recovered using server cursor |
| Repeated abort | No multipart remains; subsequent list reports missing upload |
| Corrupted part with original signed checksum | HTTP 400 `XAmzContentChecksumMismatch`; no accepted part/object |
| Wrong composite checksum at completion | HTTP 400 `XAmzContentChecksumMismatch`; no object |
| Missing signed checksum header | HTTP 400 `AccessDenied` |
| Modified signed checksum header | HTTP 403 `SignatureDoesNotMatch` |
| Anonymous GET / altered object or signature | HTTP 403 |
| One-second authorization after 2.2 seconds | HTTP 403, expired |
| `Range: bytes=10-29` | HTTP 206, exact Content-Range and exact 20 bytes |
| Unsatisfiable Range | HTTP 416 |
| Signed attachment override | Exact UTF-8 disposition and original bytes; modified override denied |
| CORS OPTIONS for PUT/checksum | HTTP 204, origin/method/header allowed |
| CORS PUT response | ETag exposed explicitly; checksum present and exposed through literal `*` for requests without credentials |

No browser was run: these tests exercise CORS protocol headers with an
Origin request, not browser UI. Default AIStor CORS currently permits the
test origin. Restrict allowed origins to the actual frontend in deployment;
CORS does not grant anonymous object access. No IAM/lifecycle equivalence
with AWS is claimed.

MinIO's checksum error maps to `UPLOAD_INTEGRITY_MISMATCH`, as does AWS
`BadDigest`. Other SDK errors are sanitized by the storage boundary; URLs,
credentials and provider stack traces are not logged by the adapter.

## Bucket setup and reproduction

The configured local `streamtube` bucket was created without a bucket policy;
anonymous read was denied on isolated test objects. Bucket provisioning is
an operator responsibility: no app-start hook changes bucket policies or
creates buckets in production. Recreated MinIO data volumes require creating
the configured bucket again through the authenticated console at port 9001.
Keep anonymous access disabled. Never add public-read ACL/policies.

Run from `nestjs-project/`:

```powershell
docker compose exec -T -e DB_NAME=streamtube_test -e DB_DATABASE=streamtube_test nestjs-api npm test -- --runInBand --runTestsByPath src/storage/storage.integration-spec.ts src/storage/storage-delivery.integration-spec.ts src/storage/storage.module.spec.ts
```

The fixtures create random `si0311-*` buckets and remove only their own
objects/multipart uploads/buckets. They refuse endpoints outside the Compose
`minio` host. The suites do not connect to PostgreSQL or modify the configured
application bucket. The 10GB/resource rehearsal remains SI-03.8.

References:

- [AWS additional multipart checksums](https://docs.aws.amazon.com/AmazonS3/latest/userguide/tutorial-s3-mpu-additional-checksums.html)
- [AWS checksum types](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [SDK 3.1153.0 presigner](https://github.com/aws/aws-sdk-js-v3/blob/v3.1153.0/packages/s3-request-presigner/README.md)
