---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.3
target_file: nestjs-project/test/videos-upload-sessions-create.e2e-spec.ts
---

# POST /videos/upload-sessions Test Plan

## Application Overview

Contrato HTTP de `POST /videos/upload-sessions` para upload e entrega privada de vídeos do proprietário, conforme SI-03.3 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. POST /videos/upload-sessions

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. criar-rascunho

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar JSON válido com originalFilename, sizeBytes, contentType, Bearer do proprietário e Idempotency-Key inédita.
    - expect: 201 com videoId, publicId, uploadSessionId, status uploading e expiresAt; vídeo draft no canal próprio, título sanitizado e sessão persistidos.

#### 1.2. repetir-inicio-idempotente

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Repetir o mesmo request e chave, inclusive após reinicializar a aplicação com persistência preservada.
    - expect: 200 com a mesma identidade; somente um vídeo, uma sessão e um multipart.

#### 1.3. rejeitar-chave-conflitante

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Reutilizar a chave de uma sessão com sizeBytes diferente.
    - expect: 409 IDEMPOTENCY_CONFLICT no envelope { statusCode, error, message }; nenhuma nova identidade.

#### 1.4. limitar-sessoes-ativas

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Criar duas sessões ativas com chaves distintas e solicitar uma terceira.
    - expect: 409 UPLOAD_SESSION_LIMIT; apenas duas reservas ativas.

#### 1.5. rejeitar-anonimo-e-excesso

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar request válido sem Bearer; em request independente autenticado, declarar sizeBytes=10000000001.
    - expect: 401 no primeiro request; 413 VIDEO_TOO_LARGE no segundo, sem criar vídeo ou multipart.

#### 1.6. validar-request

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar request autenticado sem originalFilename e sem Idempotency-Key.
    - expect: 400 no envelope de validação herdado, sem criar sessão; provar wiring da validação, sem enumerar regras da biblioteca.
