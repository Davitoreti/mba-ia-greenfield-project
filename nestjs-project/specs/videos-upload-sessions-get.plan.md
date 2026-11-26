---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.3.1
target_file: nestjs-project/test/videos-upload-sessions-get.e2e-spec.ts
---

# GET /videos/upload-sessions/:uploadSessionId Test Plan

## Application Overview

Contrato HTTP de `GET /videos/upload-sessions/:uploadSessionId` para upload e entrega privada de vídeos do proprietário, conforme SI-03.3.1 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. GET /videos/upload-sessions/:uploadSessionId

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. listar-partes-com-cursor

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Criar sessão própria, enviar partes ao MinIO e consultar páginas usando partNumberMarker até esgotar.
    - expect: 200 com videoId, publicId, uploadSessionId, status, expiresAt, parts e nextPartNumberMarker; partes contêm partNumber, sizeBytes, etag e checksum comprovado; sem omissões ou duplicatas.

#### 1.2. retomar-apos-reinicio

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar partes reais; fechar e recriar a aplicação sobre o mesmo banco/storage; consultar a mesma sessão.
    - expect: 200 com as mesmas identidades e partes; nenhum novo multipart necessário.

#### 1.3. ocultar-sessao-alheia

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Consultar sessão de outro proprietário e UUID inexistente com Bearer válido.
    - expect: Ambos retornam 404 UPLOAD_SESSION_NOT_FOUND com envelope indistinguível.

#### 1.4. rejeitar-sessao-expirada

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar sessão própria vencida e consultar com Bearer do proprietário.
    - expect: 410 UPLOAD_SESSION_EXPIRED.

#### 1.5. exigir-autenticacao

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Consultar sessão sem Bearer.
    - expect: 401, sem revelar partes ou dados de sessão.

#### 1.6. validar-cursor

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Consultar sessão própria com partNumberMarker não inteiro.
    - expect: 400 no envelope herdado, demonstrando validação de query.
