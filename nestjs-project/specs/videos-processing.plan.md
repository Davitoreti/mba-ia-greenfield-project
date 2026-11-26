---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6
target_file: nestjs-project/test/videos-processing.e2e-spec.ts
---

# GET /videos/:publicId/processing Test Plan

## Application Overview

Contrato HTTP de `GET /videos/:publicId/processing` para upload e entrega privada de vídeos do proprietário, conforme SI-03.6 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. GET /videos/:publicId/processing

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. consultar-estado-persistido

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar vídeo próprio ready com metadados e artefatos reais; reiniciar aplicação preservando banco/storage; consultar publicId.
    - expect: 200 com { publicId, status, metadata, error }; estado e metadados persistidos, sem percentual artificial.

#### 1.2. consultar-erro-sanitizado

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar falha histórica de processamento e consultar como proprietário.
    - expect: 200 com status error e error { error, message, retryable }; sem stack, caminhos internos, argumentos FFmpeg ou segredos.

#### 1.3. proteger-consulta

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Consultar sem Bearer; depois com Bearer de outro proprietário e com publicId inexistente.
    - expect: 401 para anônimo; 404 VIDEO_NOT_FOUND indistinguível para alheio e ausente.

#### 1.4. consultar-processamento-pendente

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Consultar vídeo próprio uploading e processing ainda sem metadados disponíveis.
    - expect: 200 com estado técnico persistido, metadata e error nullable conforme disponibilidade; nenhuma indicação ready prematura.
