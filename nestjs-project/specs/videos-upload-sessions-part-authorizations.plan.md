---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.3.2
target_file: nestjs-project/test/videos-upload-sessions-part-authorizations.e2e-spec.ts
---

# POST /videos/upload-sessions/:uploadSessionId/part-authorizations Test Plan

## Application Overview

Contrato HTTP de `POST /videos/upload-sessions/:uploadSessionId/part-authorizations` para upload e entrega privada de vídeos do proprietário, conforme SI-03.3.2 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. POST /videos/upload-sessions/:uploadSessionId/part-authorizations

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. autorizar-put-direto

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar partNumbers válidos com os campos de integridade comprovados em SI-03.1.1; usar URL e headers retornados no PUT direto ao MinIO.
    - expect: 200 com parts[{ partNumber, url, headers, expiresAt }]; PUT aceito e parte consultável; credenciais não são campos da resposta.

#### 1.2. renovar-sem-perder-partes

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar uma parte, renovar a autorização de uma parte pendente e consultar a sessão.
    - expect: 200 com nova autorização; mesma sessão, vídeo e parte recebida preservados.

#### 1.3. limitar-validade

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização com sessão válida por menos de 15 minutos.
    - expect: expiresAt da autorização não excede o prazo restante nem 15 minutos a partir da emissão.

#### 1.4. rejeitar-expirada

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização para sessão própria vencida.
    - expect: 410 UPLOAD_SESSION_EXPIRED, sem emitir URL.

#### 1.5. validar-partes-duplicadas

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar partNumbers com número repetido para sessão própria ativa.
    - expect: 400; nenhuma autorização emitida.

#### 1.6. proteger-propriedade

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Solicitar autorização sem Bearer; repetir autenticado para sessão alheia e inexistente.
    - expect: 401 para anônimo; 404 UPLOAD_SESSION_NOT_FOUND indistinguível para alheia e ausente.
