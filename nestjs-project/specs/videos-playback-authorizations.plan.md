---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6.1
target_file: nestjs-project/test/videos-playback-authorizations.e2e-spec.ts
---

# POST /videos/:publicId/playback-authorizations Test Plan

## Application Overview

Contrato HTTP de `POST /videos/:publicId/playback-authorizations` para upload e entrega privada de vídeos do proprietário, conforme SI-03.6.1 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. POST /videos/:publicId/playback-authorizations

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. autorizar-derivado-pronto

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização como proprietário de vídeo ready com derivado MP4 real.
    - expect: 200 com publicId, url, expiresAt e contentType video/mp4; validade até 15 minutos; URL aponta para o derivado privado.

#### 1.2. ler-range-direto

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Usar a URL emitida diretamente no storage com Range bytes=0-1023, depois outra faixa para seek.
    - expect: 206 com bytes correspondentes ao derivado e Content-Range correto; resposta parcial, sem baixar objeto inteiro e sem proxy pela API.

#### 1.3. rejeitar-range-invalido

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar ao storage Range inteiramente fora do comprimento do derivado.
    - expect: 416; sem retorno integral do objeto.

#### 1.4. rejeitar-video-nao-pronto

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização para vídeo próprio uploading, processing e error em fixtures independentes.
    - expect: 409 VIDEO_NOT_READY em cada estado, sem URL.

#### 1.5. proteger-emissao

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar sem Bearer; depois como outro proprietário e para publicId inexistente.
    - expect: 401 para anônimo; 404 VIDEO_NOT_FOUND indistinguível nos demais; nenhuma URL emitida.
