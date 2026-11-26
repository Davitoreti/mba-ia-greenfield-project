---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.3.3
target_file: nestjs-project/test/videos-upload-sessions-abort.e2e-spec.ts
---

# DELETE /videos/upload-sessions/:uploadSessionId Test Plan

## Application Overview

Contrato HTTP de `DELETE /videos/upload-sessions/:uploadSessionId` para upload e entrega privada de vídeos do proprietário, conforme SI-03.3.3 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. DELETE /videos/upload-sessions/:uploadSessionId

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. abortar-multipart

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Criar sessão própria ativa com multipart real e enviar DELETE autenticado.
    - expect: 204 sem body; sessão aborted e multipart pendente removido do MinIO.

#### 1.2. repetir-aborto

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Repetir DELETE após aborto concluído e consultar o banco.
    - expect: 204; mesmo vídeo draft preservado, sem recriar multipart.

#### 1.3. preservar-original-aceito

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar sessão completed com vídeo processing e original aceito; enviar DELETE.
    - expect: 409 UPLOAD_STATE_CONFLICT; original e intenção de processamento preservados.

#### 1.4. exigir-autenticacao

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar DELETE sem Bearer para sessão ativa.
    - expect: 401; sessão e multipart intactos.

#### 1.5. ocultar-sessao-alheia

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar DELETE autenticado para sessão alheia e UUID inexistente.
    - expect: 404 UPLOAD_SESSION_NOT_FOUND indistinguível; multipart alheio intacto.
