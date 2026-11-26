---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6.2
target_file: nestjs-project/test/videos-download-authorizations.e2e-spec.ts
---

# POST /videos/:publicId/download-authorizations Test Plan

## Application Overview

Contrato HTTP de `POST /videos/:publicId/download-authorizations` para upload e entrega privada de vídeos do proprietário, conforme SI-03.6.2 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. POST /videos/:publicId/download-authorizations

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. baixar-original-validado

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar como proprietário de vídeo ready e fazer GET diretamente na URL retornada.
    - expect: 200 da API com publicId, url e expiresAt; download byte a byte igual ao original validado, Content-Disposition attachment; original e derivado permanecem disponíveis.

#### 1.2. sanitizar-nome-perigoso

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar nome original com CR/LF, aspas e separadores; solicitar URL e baixar diretamente do storage.
    - expect: Content-Disposition attachment com nome sanitizado, sem injeção de novos headers; bytes continuam sendo o original.

#### 1.3. rejeitar-video-nao-pronto

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar para vídeo próprio uploading, processing e error em fixtures independentes.
    - expect: 409 VIDEO_NOT_READY, sem URL nem acesso a objeto pendente/rejeitado.

#### 1.4. ocultar-video-alheio

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar com Bearer de outro proprietário e para publicId inexistente.
    - expect: 404 VIDEO_NOT_FOUND indistinguível, sem URL.

#### 1.5. expirar-url

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Emitir URL com TTL curto pela configuração real de teste, respeitando o máximo de 15 minutos; realizar GET antes e depois do vencimento no relógio real do storage.
    - expect: Antes, download permitido; após vencer, novo GET negado pelo storage. Não presumir status de erro S3 não definido no plano.

#### 1.6. exigir-autenticacao

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização sem Bearer.
    - expect: 401; nenhuma URL emitida.
