---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.4
target_file: nestjs-project/test/videos-upload-sessions-completion.e2e-spec.ts
---

# POST /videos/upload-sessions/:uploadSessionId/completion Test Plan

## Application Overview

Contrato HTTP de `POST /videos/upload-sessions/:uploadSessionId/completion` para upload e entrega privada de vídeos do proprietário, conforme SI-03.4 e API Contracts de `docs/phases/phase-03-videos/phase-03-videos.md`. Erros preservam o envelope `{ statusCode, error, message }`; ACs são numerados pela ordem dos bullets do SI.

## Test Scenarios

### 1. POST /videos/upload-sessions/:uploadSessionId/completion

**Setup:** Bootstrap de AppModule real com Test.createTestingModule(...).compile(), reproduzindo pipes, filtros, interceptors e prefixo de main.ts; app.init() em beforeAll e app.close() em afterAll. Antes de cada cenário, limpar exclusivamente streamtube_test, isolar bucket/prefixos e jobs de teste e criar usuários/canais/tokens válidos pelos mecanismos existentes. PostgreSQL, MinIO e Redis reais via nomes Compose; nenhuma substituição dos serviços internos. Executar Jest/Supertest no container, serialmente (--runInBand). Restaurar serviços/configuração e remover recursos de teste em finally. Fixtures de sucesso são independentes; nenhuma depende do cenário anterior. Campos/headers de checksum devem seguir a evidência SI-03.1.1 antes de implementar estes testes; esta spec não escolhe algoritmo.

#### 1.1. aceitar-original-integro

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar partes reais válidas e concluir com parts[{ partNumber, etag }] e checksum comprovado em SI-03.1.1.
    - expect: 202 com videoId, publicId e status processing; sessão completed, vídeo processing e uma ProcessingOutbox da geração persistidos atomicamente.

#### 1.2. repetir-conclusao

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Repetir conclusão aceita; depois preparar resultado ready válido e repetir novamente.
    - expect: Mesma identidade e apenas uma intenção por geração; quando ready, 200 com status ready. Não fixar status HTTP intermediário além do contrato.

#### 1.3. rejeitar-tamanho-real-excessivo

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar objeto real acima de 10000000000 bytes pelo caminho de fixture de grande volume e solicitar conclusão.
    - expect: 413 VIDEO_TOO_LARGE; sem intenção de processamento; limpeza agendada. Fixture não trafega pelo JSON/API e não simula tamanho com mock.

#### 1.4. rejeitar-integridade-divergente

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Preparar upload com divergência verificável pelo algoritmo comprovado e solicitar conclusão.
    - expect: 422 UPLOAD_INTEGRITY_MISMATCH; sem outbox/evento de processamento e limpeza agendada; não tratar ETag como hash.

#### 1.5. aceitar-com-redis-indisponivel

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Indisponibilizar Redis de teste após bootstrap, mantendo PostgreSQL/MinIO prontos; concluir upload íntegro e restaurar Redis ao final.
    - expect: 202 após commit; intenção permanece durável e disponível ao relay, sem depender do enqueue síncrono.

#### 1.6. evitar-commit-parcial

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Induzir falha real controlada de persistência durante a transação de conclusão, por fixture SQL reversível; enviar conclusão e remover a falha em finally.
    - expect: Nenhuma combinação parcial de sessão completed, vídeo processing e outbox; nenhum job aceito sem intenção persistida. Não inventar código HTTP para falha não especificada.

#### 1.7. validar-lista-de-partes

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar conclusão autenticada com partNumbers duplicados na lista parts.
    - expect: 400 por validação ou UPLOAD_PARTS_INVALID conforme contrato; sem intenção de processamento.

#### 1.8. proteger-conclusao

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-26T00:37:40Z

**Steps:**
  1. Enviar conclusão sem Bearer; repetir autenticado para sessão alheia e ausente.
    - expect: 401 para anônimo; 404 UPLOAD_SESSION_NOT_FOUND indistinguível para alheia e ausente; nenhum efeito externo.
