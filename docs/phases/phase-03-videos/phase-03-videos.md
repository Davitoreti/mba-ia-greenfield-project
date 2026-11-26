---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/library-refs.md: "2026-11-26T00:09:58.4278935Z"
  docs/phases/phase-03-videos/context.md: "2026-11-26T00:09:58.4623916Z"
  docs/phases/phase-03-videos/validation.md: "2026-11-26T00:09:58.4633936Z"
  docs/project-plan.md: "2026-11-24T23:08:12.9071253Z"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-26T00:07:58.5264410Z"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-11-24T23:08:12.8941073Z"
  docs/phases/phase-01-configuracao-base/context.md: "2026-11-25T00:25:10.2883095Z"
  docs/phases/phase-02-auth/context.md: "2026-11-24T23:08:12.9051261Z"
  docs/phases/phase-02-auth-frontend/context.md: "2026-11-25T00:25:10.2933112Z"
  .agents/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-25T00:25:10.1623102Z"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar somente no backend armazenamento privado, upload retomável de até 10GB com rascunho automático, processamento em segundo plano, extração de metadados e thumbnail, identidade única, reprodução progressiva e download autorizado pelo proprietário; frontend, publicação editorial e acesso anônimo pertencem a entregas posteriores.

---

## Step Implementations

### SI-03.1 — Preparar infraestrutura e dependências

**Description:** Disponibilizar a stack real de storage, fila e worker, isolando os recursos da API.

**Technical actions:**

1. Antes de executar qualquer SI, inicializar `docs/phases/phase-03-videos/progress.md` com todos os SIs pendentes, estado geral e campos de evidências; verificar leitura de AGENTS.md e descoberta das skills/subagentes portados, executar consulta de documentação via Context7 e consulta somente leitura via MCP PostgreSQL. Registrar resultados ou bloqueios no progresso e corrigir a configuração antes de avançar. Ao finalizar cada SI, atualizar seu status, testes e evidências antes de iniciar o próximo.
2. Instalar no container AWS SDK/presigner `3.1153.0`, `bullmq@5.81.5` e `@nestjs/bullmq@11.0.5`, com manifesto/lockfile exatos; conferir engines/peers e APIs do cache antes da instalação (per `phase-03-videos/TD-01`, `TD-04`, `TD-06`; `library-refs.md`).
3. Acrescentar MinIO, Redis e serviço `video-worker` ao Compose; fixar tags/digests publicados, persistência, healthchecks e política de recuperação. Empacotar FFmpeg/ffprobe com H.264/AAC e entrypoint de worker separado, sem iniciar HTTP.
4. Configurar storage, fila e processamento por domínio via `registerAs`, Joi e injeção tipada; hosts internos são nomes Compose, com endpoint de assinatura alcançável pelo consumidor separado do endpoint interno (per `phase-01-configuracao-base/TD-01..TD-04`).
5. Fixar orçamentos iniciais configuráveis de CPU, memória, disco temporário, timeout e concorrência um; documentar os valores escolhidos e seus critérios de medição antes de processar fixtures (per `phase-03-videos/TD-06`).

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- Compose apresenta db, API, storage, Redis e worker em execução e cada serviço confirma prontidão.
- Antes das alterações de implementação, progress.md contém todos os SIs pendentes e evidências de que a fundação Codex foi reconhecida e os MCPs Context7/PostgreSQL responderam; após cada SI, seu estado e resultados estão registrados.
- Worker informa versões de FFmpeg/ffprobe e disponibilidade dos codecs H.264/AAC, sem expor servidor HTTP.
- Reiniciar storage/Redis preserva os dados configurados; o hostname interno resolve pela rede Compose.

---

### SI-03.1.1 — Implementar storage e comprovar integridade multipart

**Description:** Oferecer um adaptador de storage testado contra MinIO real antes de fechar contratos de upload.

**Technical actions:**

1. Criar `src/storage/` com porta tipada e adaptador AWS SDK: iniciar, listar partes com paginação, assinar partes, concluir, abortar, consultar/remover objetos e assinar leitura/download (per `phase-03-videos/TD-01`, `TD-02`, `TD-10`).
2. Gerar chaves internas por canal/vídeo/categoria e manter bucket privado; aplicar assinatura com host correto e headers obrigatórios, sem registrar credenciais/URLs.
3. Executar a etapa aprovada de compatibilidade: partes e objeto íntegros, corrupção, assinatura, CORS/ETag, Range/206/416 e overrides de download; selecionar algoritmo suportado e documentar evidência e semântica (per revisão `phase-03-videos/TD-03`).
4. Refletir os campos/headers comprovados de checksum no contrato de assinatura/conclusão e neste plano antes dos SIs de upload; não avançar se nenhuma estratégia cumprir os critérios. Compilar módulo com configuração real de teste.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Storage adapter | Integration: MinIO, multipart, paginação, integridade e abort | `src/storage/storage.integration-spec.ts` |
| Autorizações de objetos | Integration: Range, assinatura, expiração e disposition | `src/storage/storage-delivery.integration-spec.ts` |
| StorageModule | Unit: compilação DI com cliente configurado | `src/storage/storage.module.spec.ts` |

**Dependencies:** SI-03.1 — serviços reais e SDK disponíveis

**Acceptance criteria:**

- Partes íntegras completam um objeto; divergência comprovada de integridade é rejeitada e não gera objeto aceito.
- Listagem paginada recupera todas as partes; abortar repetidamente não deixa multipart ativo.
- Leitura parcial retorna 206 com Content-Range correto; intervalo inválido retorna 416.
- O relatório identifica versões do storage/SDK, algoritmo escolhido e resultados reproduzíveis, sem afirmar compatibilidade não exercitada.

---

### SI-03.2 — Persistir vídeos, sessões e outbox

**Description:** Criar o modelo persistente com propriedade, identidade estável e fronteiras de domínio explícitas.

**Technical actions:**

1. Criar entidades `Video`, `UploadSession` e `ProcessingOutbox` e migrations reversíveis exatamente conforme Data Model; preservar usuário/canal existentes (per `phase-03-videos/TD-05`, `TD-08`, `TD-09`).
2. Implementar repositories e serviços de domínio donos das respectivas entidades, com transações compartilhadas por EntityManager quando necessário, sem serviços criarem entidades de outro módulo.
3. Implementar geração criptográfica de `publicId` com UNIQUE e retry limitado; reservas concorrentes de sessão por proprietário e unicidade de idempotência.
4. Inicializar `title` sanitizado não vazio, `editorialStatus=draft` e `technicalStatus=uploading`; registrar módulos/exports com contratos tipados e sem dependências circulares.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Video e geração de identidade | Unit: colisão, esgotamento, título e transições | `src/videos/videos.service.spec.ts` |
| Entidades e repositories | Integration: FKs, defaults, índices, bigint e rollback | `src/videos/videos.integration-spec.ts` |
| Reserva de sessão | Integration: unicidade e limite concorrente por proprietário | `src/uploads/upload-sessions.integration-spec.ts` |
| Módulos de domínio | Integration: compilação DI com PostgreSQL real | `src/videos/video-modules.integration-spec.ts` |

**Dependencies:** SI-03.1 — configuração de ambiente definida

**Acceptance criteria:**

- Após aplicar migrations, vídeo referencia canal existente, possui título não vazio e rascunho editorial persistido.
- Inserção com publicId duplicado ou FK inválida é rejeitada pelo banco.
- Três reservas concorrentes do mesmo usuário admitem no máximo duas sessões ativas.
- Rollback de uma conclusão simulada não persiste parcialmente estado de vídeo e outbox.

---

### SI-03.3 — Iniciar upload com rascunho idempotente

**Route:** POST /videos/upload-sessions
**Test Specs:** see `nestjs-project/specs/videos-upload-sessions-create.plan.md`
**Authorization:** Authenticated, somente o próprio canal

**Description:** Criar a identidade do vídeo e a sessão antes do envio direto de bytes ao storage.

**Technical actions:**

1. Implementar caso de uso de início em `src/uploads/`, orquestrando serviços públicos de vídeos/canais, reserva e criação recuperável do multipart (per `phase-03-videos/TD-02`, `TD-08`).
2. Aplicar Idempotency-Key/fingerprint, limite decimal, expiração e limite de duas sessões conforme API Contracts; mesma chave preserva identidade após interrupção.
3. Criar DTO/controller fino para a rota, usando guard e ValidationPipe existentes; mapear exceções pelo filtro herdado (per `phase-02-auth/TD-02`, `TD-06`, `TD-07`).
4. Documentar requests, respostas 201/200, erros e exemplos Swagger conforme `openapi-docs-nestjs/TD-01`; alinhar contrato de checksum à evidência SI-03.1.1.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Início de upload | Unit: idempotência, conflitos e compensação | `src/uploads/start-upload.service.spec.ts` |
| Reserva + criação de multipart | Integration: PostgreSQL/MinIO e interrupção recuperável | `src/uploads/start-upload.integration-spec.ts` |

**Dependencies:** SI-03.1.1, SI-03.2 — storage comprovado e domínio persistente

**Acceptance criteria:**

- Solicitação válida retorna 201 com videoId, publicId, uploadSessionId, status e expiresAt, com rascunho persistido.
- Repetir a mesma chave/payload retorna 200 e a mesma identidade sem segundo vídeo/multipart.
- Chave com payload diferente retorna 409 IDEMPOTENCY_CONFLICT; terceira sessão retorna 409 UPLOAD_SESSION_LIMIT.
- Solicitação anônima retorna 401 e tamanho acima do teto retorna 413 VIDEO_TOO_LARGE.

---

### SI-03.3.1 — Consultar sessão e partes para retomada

**Route:** GET /videos/upload-sessions/:uploadSessionId
**Test Specs:** see `nestjs-project/specs/videos-upload-sessions-get.plan.md`
**Authorization:** Owner

**Description:** Permitir retomada a partir da persistência e das partes efetivamente recebidas pelo storage.

**Technical actions:**

1. Implementar consulta de sessão com propriedade e validade, usando paginação real do adaptador (per `phase-03-videos/TD-02`, `TD-03`).
2. Devolver `parts`, `nextPartNumberMarker` e metadados conforme API Contracts, incluindo a integridade comprovada; não usar a memória da API como fonte da retomada.
3. Expor controller/DTO e Swagger tipados; não revelar se sessão alheia existe.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Consulta e autorização | Unit: sessão ausente, alheia e expirada | `src/uploads/get-upload.service.spec.ts` |
| Retomada | Integration: partes reais e reinicialização do serviço | `src/uploads/resume-upload.integration-spec.ts` |

**Dependencies:** SI-03.3 — sessão iniciada com propriedade persistida

**Acceptance criteria:**

- Sessão própria retorna 200 com partes recebidas e cursor correto.
- Após reiniciar a API, a mesma sessão permite recuperar as partes sem reiniciar o upload.
- Sessão alheia retorna 404 UPLOAD_SESSION_NOT_FOUND; sessão própria vencida retorna 410 UPLOAD_SESSION_EXPIRED.

---

### SI-03.3.2 — Assinar e renovar autorizações de partes

**Route:** POST /videos/upload-sessions/:uploadSessionId/part-authorizations
**Test Specs:** see `nestjs-project/specs/videos-upload-sessions-part-authorizations.plan.md`
**Authorization:** Owner, sessão ativa

**Description:** Autorizar transferência de partes diretamente ao storage sem ocupar a API com o arquivo.

**Technical actions:**

1. Implementar assinatura por parte e renovação, validando sessão/proprietário, números distintos e limites multipart conforme API Contracts (per `phase-03-videos/TD-02`, `TD-03`).
2. Incluir headers de checksum aprovados em SI-03.1.1 e validade de no máximo 15min, limitada pelo prazo restante da sessão.
3. Criar controller, DTOs e Swagger com resposta `{ parts: [{ partNumber, url, headers, expiresAt }] }`; sanitizar logs e erros externos.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Autorização de partes | Unit: validade, duplicatas e estados | `src/uploads/authorize-parts.service.spec.ts` |
| PUT autorizado | Integration: URL real, headers obrigatórios e renovação | `src/uploads/authorize-parts.integration-spec.ts` |

**Dependencies:** SI-03.3.1 — propriedade/consulta de sessão estabelecidas

**Acceptance criteria:**

- Partes válidas recebem 200 e URLs que aceitam PUT direto no storage com headers assinados.
- Renovação preserva as partes recebidas e a identidade da sessão.
- Sessão expirada retorna 410 e não emite autorização além de expiresAt; partes duplicadas retornam 400.

---

### SI-03.3.3 — Abortar sessão sem apagar o rascunho

**Route:** DELETE /videos/upload-sessions/:uploadSessionId
**Test Specs:** see `nestjs-project/specs/videos-upload-sessions-abort.plan.md`
**Authorization:** Owner

**Description:** Encerrar uploads abandonados com efeito externo recuperável e sem cancelar processamento já aceito.

**Technical actions:**

1. Implementar transição de aborto e disputa com conclusão usando os estados definidos em Data Model (per `phase-03-videos/TD-03`, `TD-08`).
2. Abortar multipart fora da transação; em falha transitória, conservar estado/intenção que a reconciliação consiga recuperar.
3. Expor rota com 204 idempotente, erros e autorização conforme API Contracts.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Aborto | Unit: repetição e conflito de estado | `src/uploads/abort-upload.service.spec.ts` |
| Aborto e storage | Integration: limpeza real e persistência após falha | `src/uploads/abort-upload.integration-spec.ts` |

**Dependencies:** SI-03.3 — sessão e multipart existentes

**Acceptance criteria:**

- Abortar sessão própria ativa retorna 204 e remove o multipart pendente.
- Repetição de aborto retorna 204 e conserva o vídeo rascunho.
- Sessão já concluída/processando retorna 409 UPLOAD_STATE_CONFLICT sem remover o original aceito.

---

### SI-03.4 — Concluir upload e registrar intenção durável

**Route:** POST /videos/upload-sessions/:uploadSessionId/completion
**Test Specs:** see `nestjs-project/specs/videos-upload-sessions-completion.plan.md`
**Authorization:** Owner

**Description:** Aceitar processamento somente após tamanho e integridade comprovados, com estado e outbox atômicos.

**Technical actions:**

1. Validar partes contra storage e concluir/verificar o objeto fora da transação SQL, usando o algoritmo aprovado (per `phase-03-videos/TD-03`).
2. Gravar sessão completed, vídeo processing e `ProcessingOutbox` com o mesmo EntityManager transacional e chave de geração única (per `phase-03-videos/TD-05`, revisão).
3. Tornar a conclusão repetível e recuperável após queda entre storage e commit; rejeição marca limpeza sem enfileirar.
4. Expor controller/DTO/Swagger com responses 202/200 e erros exatamente conforme API Contracts; publicação Redis fica fora do request/commit.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Conclusão | Unit: partes inválidas, tamanho e idempotência | `src/uploads/complete-upload.service.spec.ts` |
| Storage + transação + outbox | Integration: falhas intermediárias e rollback | `src/uploads/complete-upload.integration-spec.ts` |

**Dependencies:** SI-03.3.2, SI-03.3.3 — assinatura e disputas de sessão definidas

**Acceptance criteria:**

- Objeto íntegro retorna 202 com status processing e uma única intenção persistida.
- Repetir conclusão não duplica intenção; vídeo já pronto retorna 200 com status ready.
- Objeto acima do limite retorna 413; integridade divergente retorna 422 UPLOAD_INTEGRITY_MISMATCH, sem evento de processamento.
- Redis indisponível não perde a intenção após commit; falha de commit não deixa estado SQL parcial.

---

### SI-03.4.1 — Publicar outbox com relay recuperável

**Description:** Entregar jobs ao Redis/BullMQ sem perder a intenção diante de reinícios ou confirmação interrompida.

**Technical actions:**

1. Implementar relay em `src/processing-outbox/`, com seleção de pendências, lease e liberação/recuperação após reinício (per `phase-03-videos/TD-05`).
2. Publicar `video.processing.requested` com payload exato de Events/Messages e jobId estável válido para BullMQ; marcar publishedAt somente após enqueue confirmado.
3. Configurar fila via `BullModule.forRootAsync` e registro de fila, com configuração por domínio e sem iniciar consumidor na API (per `phase-03-videos/TD-04`; cache BullMQ/NestJS).
4. Separar tentativas de publicação do orçamento de três tentativas do processamento; fechamento gracioso libera conexões.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Relay | Unit: falha, confirmação e lease | `src/processing-outbox/outbox-relay.service.spec.ts` |
| Outbox + Redis | Integration: reconexão, concorrência e publicação repetida | `src/processing-outbox/outbox-relay.integration-spec.ts` |
| QueueModule | Unit: compilação DI com configuração | `src/processing-queue/processing-queue.module.spec.ts` |

**Dependencies:** SI-03.4 — intenção transacional disponível

**Acceptance criteria:**

- Evento persistido durante indisponibilidade Redis aparece na fila após recuperação.
- Dois relays concorrentes recuperam a pendência sem perda de intenção.
- Queda após enqueue e antes de publishedAt permite repetição com a mesma identidade de evento.

---

### SI-03.5 — Inspecionar mídia e produzir artefatos privados

**Description:** Gerar metadados, thumbnail e reprodução compatível dentro dos limites do worker.

**Technical actions:**

1. Criar executor FFmpeg/ffprobe em `src/video-processing/` com argumentos sem shell, diretório temporário isolado, timeout e cancelamento (per `phase-03-videos/TD-06`).
2. Validar MP4/MOV reais, duração e decodificação; extrair metadados e frame, incluindo rotação/orientação (per `phase-03-videos/TD-06`, `TD-07`).
3. Gerar MP4 H.264/AAC com faststart, sem exigir áudio quando ausente; reaproveitar streams somente se compatíveis, sem HLS/múltiplas rendições.
4. Transferir artefatos privados por geração usando adaptador de storage; limpar temporários em sucesso/falha, sem remover original validado.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Executor de processos | Unit: timeout, argumentos e cancelamento | `src/video-processing/media-executor.spec.ts` |
| FFmpeg/ffprobe | Integration: fixtures válidas, truncadas, sem áudio e orientação | `src/video-processing/media-pipeline.integration-spec.ts` |
| Artefatos | Integration: storage privado, faststart e limpeza | `src/video-processing/media-artifacts.integration-spec.ts` |

**Dependencies:** SI-03.1.1 — storage real e binários de SI-03.1 disponíveis

**Acceptance criteria:**

- MP4/MOV válidos produzem duração, metadados, thumbnail e MP4 de reprodução compatível.
- Arquivo inválido ou truncado é rejeitado sem artefatos disponibilizados como prontos.
- Timeout encerra subprocesso e libera temporários; vídeo sem áudio continua reproduzível sem trilha artificial.

---

### SI-03.5.1 — Consumir jobs com idempotência e estado persistido

**Description:** Integrar o pipeline ao worker real com recuperação e distinção entre falhas transitórias e definitivas.

**Technical actions:**

1. Criar bootstrap de worker e consumidor `@Processor`/`WorkerHost`, com concorrência um e módulos focados (per `phase-03-videos/TD-04`, `TD-06`; cache NestJS/BullMQ).
2. Recarregar vídeo/processingVersion e proteger execução/finalização por estado/versão; efeitos repetidos não alteram geração já concluída (per `phase-03-videos/TD-05`).
3. Invocar pipeline e marcar ready somente após todos os artefatos/metadados disponíveis; conservar editorialStatus draft (per `phase-03-videos/TD-07`, `TD-08`).
4. Aplicar três tentativas totais com backoff limitado, falha permanente para mídia inválida, erro sanitizado persistido e fechamento gracioso; não manter transação SQL durante FFmpeg.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Consumidor | Unit: geração antiga, conclusão repetida e classificação | `src/video-processing/video-processor.spec.ts` |
| Worker real | Integration: Redis/PostgreSQL/storage, reinício e retry | `src/video-processing/video-worker.integration-spec.ts` |

**Dependencies:** SI-03.4.1, SI-03.5 — fila publicada e pipeline de mídia

**Acceptance criteria:**

- Upload aceito é consumido pelo worker e o vídeo chega a ready com todos os artefatos privados.
- Job duplicado ou de geração antiga não duplica efeitos nem sobrescreve o resultado vigente.
- Falha transitória esgota no máximo três tentativas e persiste erro final; mídia inválida não é repetida como transitória.
- Reiniciar o worker durante processamento permite recuperação sem publicar conteúdo editorial.

---

### SI-03.6 — Consultar estado técnico e preparar entrega autorizada

**Route:** GET /videos/:publicId/processing
**Test Specs:** see `nestjs-project/specs/videos-processing.plan.md`
**Authorization:** Owner

**Description:** Expor estado persistido e centralizar a autorização de mídia para os endpoints de entrega.

**Technical actions:**

1. Implementar consulta por publicId e serviços de propriedade usando o canal existente; não tratar token público como permissão (per `phase-03-videos/TD-09`, `TD-11`).
2. Devolver status, metadata e error conforme API Contracts, com retryable sanitizado e sem percentual fictício.
3. Criar serviço de entrega em `src/videos/` que resolve original/derivado/thumbnail prontos e gera autorizações via storage; preservar validade de 15min e reautorizar cada emissão (per `phase-03-videos/TD-10`).
4. Expor controller de consulta e Swagger usando envelope herdado; respeitar 404 indistinguível para recurso alheio.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Estado e propriedade | Unit: ready, erro sanitizado, ausente e alheio | `src/videos/video-status.service.spec.ts` |
| Entrega autorizada | Unit: original/derivado, validade e estado | `src/videos/video-delivery.service.spec.ts` |
| Consulta persistente | Integration: metadados e resultado do worker | `src/videos/video-status.integration-spec.ts` |

**Dependencies:** SI-03.5.1 — ciclo técnico completo persistido

**Acceptance criteria:**

- Vídeo próprio retorna 200 com estado e metadados persistidos após reinício da API.
- Falha histórica de processamento retorna 200 com status error e erro sanitizado.
- Consulta anônima retorna 401; publicId de outro proprietário retorna 404 VIDEO_NOT_FOUND.

---

### SI-03.6.1 — Autorizar reprodução progressiva

**Route:** POST /videos/:publicId/playback-authorizations
**Test Specs:** see `nestjs-project/specs/videos-playback-authorizations.plan.md`
**Authorization:** Owner, vídeo pronto

**Description:** Disponibilizar URL temporária de reprodução com Range diretamente no storage.

**Technical actions:**

1. Expor controller e DTO de resposta para a autorização do derivado conforme API Contracts, usando o serviço de entrega sem regras de domínio no controller (per `phase-03-videos/TD-07`, `TD-10`).
2. Documentar validade, contentType video/mp4, erros e o fluxo Range/206 no storage, sem criar proxy de bytes ou página frontend.
3. Exercitar leitura parcial e seek do derivado real gerado pelo worker; URL assinada não deve aparecer em logs.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Reprodução do derivado | Integration: assinatura e Range/206/416 no MinIO | `src/videos/video-playback.integration-spec.ts` |

**Dependencies:** SI-03.6 — serviço de entrega e propriedade

**Acceptance criteria:**

- Vídeo pronto próprio retorna 200 com URL, expiresAt e contentType video/mp4.
- Range válido na URL responde 206 com bytes e Content-Range corretos sem baixar o objeto inteiro; intervalo inválido responde 416.
- Vídeo não pronto retorna 409 VIDEO_NOT_READY; outro proprietário recebe 404.

---

### SI-03.6.2 — Autorizar download do original validado

**Route:** POST /videos/:publicId/download-authorizations
**Test Specs:** see `nestjs-project/specs/videos-download-authorizations.plan.md`
**Authorization:** Owner, vídeo pronto

**Description:** Entregar download privado do original sem ocupar o processo HTTP da API.

**Technical actions:**

1. Expor controller e resposta tipada conforme API Contracts, usando original validado e nome sanitizado com Content-Disposition attachment (per `phase-03-videos/TD-10`).
2. Reutilizar serviço de entrega para validade e propriedade; documentar que revogação de sessão não invalida automaticamente URL emitida.
3. Documentar respostas/erros Swagger e garantir que original e derivado permaneçam disponíveis enquanto o vídeo existir.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Download | Integration: objeto original, nome seguro e attachment | `src/videos/video-download.integration-spec.ts` |

**Dependencies:** SI-03.6 — serviço de entrega autorizado

**Acceptance criteria:**

- Vídeo pronto próprio recebe 200 com URL cujo download é o original validado e usa attachment.
- Nome com caracteres perigosos não injeta cabeçalhos na resposta do storage.
- Vídeo não pronto retorna 409; proprietário alheio recebe 404; URL vencida não permite novo download.

---

### SI-03.7 — Reconciliar sessões e limpar recursos abandonados

**Description:** Recuperar falhas entre sistemas e limitar retenção de uploads/artefatos sem apagar conteúdo aceito.

**Technical actions:**

1. Implementar rotina periódica de reconciliação em módulos donos dos recursos, com estado/lease persistidos e execução idempotente (per `phase-03-videos/TD-03`, `TD-05`).
2. Recuperar initiating interrompido, storage concluído antes do commit, sessões vencidas/abortadas/rejeitadas e publicações com lease vencido conforme Events/Messages.
3. Limpar multipart/temporários/artefatos órfãos com proteção de estado/versão contra corrida de conclusão; manter rascunho e original/derivado aceitos (per `phase-03-videos/TD-08`, `TD-10`).
4. Configurar execução e logs sem segredos; não depender de lifecycle S3 que não tenha sido comprovado no MinIO selecionado.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Reconciliação | Unit: critérios, relógio e transições | `src/uploads/upload-reconciler.service.spec.ts` |
| Limpeza real | Integration: PostgreSQL/MinIO, repetição e corrida com conclusão | `src/uploads/upload-reconciler.integration-spec.ts` |
| Recuperação entre sistemas | Integration: storage concluído antes do commit e relay interrompido | `src/processing-outbox/processing-recovery.integration-spec.ts` |

**Dependencies:** SI-03.3.3, SI-03.4.1, SI-03.5.1 — estados e efeitos externos estabelecidos

**Acceptance criteria:**

- Sessão vencida deixa de consumir reserva e multipart pendente é removido.
- Objeto concluído antes de queda de commit é reconciliado sem segunda identidade ou dupla intenção.
- Repetir limpeza não remove mídia de vídeo aceito/pronto; corrida com conclusão preserva o vencedor consistente.

---

### SI-03.8 — Validar 10GB e fechar documentação e DoD

**Description:** Demonstrar o fluxo real, medir isolamento da API e registrar o estado entregue.

**Technical actions:**

1. Preparar runner opt-in no container para upload de arquivo de vídeo válido com 10.000.000.000 bytes, retomada, processamento, Range e download; gerar fixture válida reproduzível sem carregar todo arquivo em memória (per `phase-03-videos/TD-02`, `TD-03`, `TD-06`).
2. Antes do ensaio, registrar baseline e critérios objetivos de memória/latência HTTP, CPU/disco/tempo do worker e ambiente; executar cenário e um byte acima do limite, guardando medidas e comparação em `docs/phases/phase-03-videos/verification.md`.
3. Exportar OpenAPI e revisar contratos, exemplos, erros e exposição condicionada conforme `openapi-docs-nestjs/TD-01..TD-03`; atualizar AGENTS.md raiz/subprojeto com vídeos, endpoints, storage, fila e worker somente quando implementados.
4. Executar suíte afetada, suíte completa, E2E, tsc, lint e build no container; resolver falhas antes de marcar fase concluída. Atualizar progress.md SI a SI com evidências reais e manter Git Flow, sem push automático.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Fluxo grande e recursos | Integration opt-in: stack real, métricas e 10GB | `src/videos/video-large-upload.integration-spec.ts` |

**Dependencies:** SI-03.6.1, SI-03.6.2, SI-03.7 — fluxo completo e recuperação

**Acceptance criteria:**

- Upload real de 10GB conclui com metadados, thumbnail, URL única, reprodução parcial e download; excedente é rejeitado sem enfileiramento.
- Medidas demonstram que o arquivo não atravessa/bufferiza na API e atendem aos critérios registrados antes do ensaio.
- OpenAPI descreve os endpoints efetivamente entregues; AGENTS.md não cita arquivos ou comportamentos inexistentes.
- Todas as verificações da DoD terminam com código 0 e progress.md contém evidências por SI.

---

## Technical Specifications

### Data Model

#### Video (SI-03.2)

Campos definidos por esta especificação a partir de `phase-03-videos/TD-01`, `TD-08`, `TD-09` e `TD-11`; preservar entidades de usuário e canal existentes.

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, gerado no servidor |
| publicId | varchar(12) | NOT NULL, UNIQUE, base64url criptográfico; colisões com retry limitado |
| channelId | FK do canal existente | NOT NULL; propriedade derivada do canal autenticado |
| title | varchar(255) | NOT NULL, não vazio; inicializado a partir do nome original sanitizado; edição futura |
| editorialStatus | varchar | NOT NULL, default `draft`; não é alterado pelo worker |
| technicalStatus | varchar | NOT NULL; `uploading`, `processing`, `ready`, `error` |
| originalFilename | text | Nome informativo, nunca chave de storage nem argumento de shell |
| originalObjectKey | text | Chave interna por canal/vídeo/categoria; nullable antes da conclusão |
| playbackObjectKey | text | Nullable até processamento concluído |
| thumbnailObjectKey | text | Nullable até processamento concluído |
| sizeBytes | bigint | Nullable antes de verificar o objeto; 1..10.000.000.000 |
| durationSeconds | double precision | Nullable antes do ffprobe; duração finita e positiva quando pronto |
| mediaMetadata | jsonb | Nullable; metadados técnicos tipados, sem caminhos temporários/segredos |
| processingError | jsonb | Nullable; `{ error, message, retryable }` sanitizado |
| processingVersion | integer | NOT NULL; geração do processamento para proteção contra jobs antigos |
| createdAt, updatedAt | timestamptz | NOT NULL, geridos na persistência |

**Relations:** `Video` pertence a um canal; o domínio de canais resolve propriedade. Persistir `editorialStatus=draft` desde a criação e mantê-lo durante todo o ciclo; `draft` + `uploading` representa o rascunho inicial. Vídeo pronto continua rascunho e privado: estado editorial permanece separado do estado técnico, sem criar fluxo de publicação nesta fase (`phase-03-videos/TD-08`).
**Indexes:** UNIQUE em `publicId`; índice em `channelId`; índice de reconciliação por `technicalStatus, updatedAt`.

#### UploadSession (SI-03.2)

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, gerado no servidor |
| videoId | uuid | FK Video, NOT NULL |
| ownerId | FK do usuário existente | NOT NULL; confere proprietário antes de operar |
| idempotencyKey | varchar(128) | NOT NULL; UNIQUE com `ownerId` |
| requestFingerprint | text | NOT NULL; mesma chave com solicitação diferente retorna conflito |
| storageUploadId | text | Nullable durante criação recuperável; nunca expor credenciais |
| objectKey | text | NOT NULL, destino controlado pelo servidor |
| declaredSizeBytes | bigint | NOT NULL, 1..10.000.000.000 |
| status | varchar | `initiating`, `uploading`, `completing`, `completed`, `aborted`, `expired`, `rejected` |
| checksumAlgorithm, checksumValue | text | Nullable até etapa de compatibilidade; nenhum algoritmo presumido |
| expiresAt | timestamptz | NOT NULL; início + 24h, configurável |
| completedAt | timestamptz | Nullable; preenchido após verificação e commit |
| createdAt, updatedAt | timestamptz | NOT NULL |

**Relations:** sessão separada da identidade estável do vídeo; expirar/abortar sessão não apaga o rascunho (`phase-03-videos/TD-08`).
**Indexes:** UNIQUE `ownerId, idempotencyKey`; índice `ownerId, status`; índice `status, expiresAt`.
**Concurrency:** serializar a reserva de sessões pelo proprietário para cumprir o limite de duas sessões ativas mesmo com solicitações concorrentes. Reservas `initiating`, `uploading` e `completing` consomem o limite; falha de criação do multipart é reconciliável. Persistir autorização/idempotência antes dos efeitos externos. Partes recebidas são consultadas no storage, não presumidas a partir de dados do cliente (`phase-03-videos/TD-02`, `TD-03`, `TD-08`).

#### ProcessingOutbox (SI-03.2 / SI-03.4)

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK; identidade estável do evento |
| videoId | uuid | FK Video, NOT NULL |
| processingVersion | integer | NOT NULL |
| eventType | varchar | NOT NULL, `video.processing.requested` |
| payload | jsonb | NOT NULL, payload mínimo validado |
| availableAt | timestamptz | NOT NULL; próxima publicação elegível |
| leaseUntil | timestamptz | Nullable; recuperação de relay interrompido |
| publishedAt | timestamptz | Nullable; somente após confirmação do enqueue |
| publishAttempts | integer | NOT NULL, default 0; separado das tentativas do worker |
| createdAt | timestamptz | NOT NULL |

**Indexes:** UNIQUE `videoId, processingVersion, eventType`; índice nas publicações pendentes por `availableAt`; lease impede publicação concorrente sem impedir recuperação.
**Atomicity:** concluir a verificação no storage antes da transação curta que grava sessão concluída, vídeo `processing` e outbox. Usar apenas o EntityManager transacional para todas essas escritas; falha de enqueue preserva a intenção. A confirmação de Redis seguida de falha ao marcar `publishedAt` permite repetição, protegida pelo consumidor idempotente (`phase-03-videos/TD-05`, revisão aprovada). A API não mantém transação aberta durante storage, fila ou FFmpeg.

#### Storage e fronteiras de domínio (SI-03.1 / SI-03.5)

- Bucket privado único e chaves geradas no servidor por canal/vídeo/categoria: original, reprodução e thumbnail. Guardar chaves, gerar URLs apenas sob autorização; não persistir URLs assinadas (`phase-03-videos/TD-01`, `TD-10`).
- Módulos focados para vídeos, sessões de upload, storage, outbox/fila e processamento. Cada módulo cria e altera suas entidades; orquestração chama serviços públicos dos domínios. O worker reutiliza módulos sem carregar controllers HTTP (`phase-03-videos/TD-06`).
- Dependências de storage/fila estão registradas em `library-refs.md`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@nestjs/bullmq` e `bullmq`. Instalar as versões exatas selecionadas no cache (AWS SDK/presigner 3.1153.0, BullMQ 5.81.5 e @nestjs/bullmq 11.0.5), registrá-las no manifesto/lockfile e fixar tags/digests dos serviços/binários; o cache distingue documentação consultada de integração comprovada.
- MinIO, Redis e worker reais no Compose; conexões entre serviços usam nomes Compose. Separar endpoint interno do storage da origem alcançável pelo cliente para que a URL assinada preserve host e assinatura. Configuração por domínio com `registerAs`, validação Joi e injeção tipada herdadas de `phase-01-configuracao-base/TD-01..TD-04`.
- Migrações explícitas; não usar sincronização automática. Fixtures e testes reais verificam limites, unicidade, FKs, transações e reservas concorrentes. Tamanhos bigint não podem sofrer truncamento de 32 bits.

---

### API Contracts

Contratos do backend NestJS; nenhum BFF ou tela será implementado. Novos nomes de recursos e campos abaixo são definidos por este plano, preservando o envelope herdado `{ statusCode, error, message }` e autenticação existente. Documentar operações, DTOs, respostas por status, erros e exemplos com Swagger e exportar `openapi.json` conforme `openapi-docs-nestjs/TD-01..TD-03`.

#### POST /videos/upload-sessions (SI-03.3)

**Request headers:**
- Authorization: Bearer do mecanismo existente.
- Content-Type: application/json.
- Idempotency-Key: string, obrigatório, 1..128 caracteres; escopo do proprietário.

**Request body:**
- originalFilename: string obrigatório, não vazio; sanitizado para metadado/download.
- sizeBytes: integer obrigatório, 1..10.000.000.000.
- contentType: string obrigatório, informativo; validar mídia real no processamento.

**Response 201:** `{ videoId, publicId, uploadSessionId, status, expiresAt }`; `status: uploading`. Cria rascunho persistido (`editorialStatus=draft`), `title` derivado do nome original sanitizado e sessão recuperável no canal do proprietário. Repetição com mesma chave/fingerprint devolve a mesma identidade e `200`, inclusive após falha recuperável, sem criar outro multipart/vídeo.
**Error responses:** 400 validação; 401 autenticação; 409 `IDEMPOTENCY_CONFLICT` ou `UPLOAD_SESSION_LIMIT`; 413 `VIDEO_TOO_LARGE`; 503 `STORAGE_UNAVAILABLE`. Reserva com criação externa interrompida permanece reconciliável (`phase-03-videos/TD-02`, `TD-03`, `TD-08`).

---

#### GET /videos/upload-sessions/:uploadSessionId (SI-03.3.1)

**Request headers:** Authorization: Bearer.
**Request query parameters:** `partNumberMarker`: integer opcional para paginação das partes.
**Response 200:** `{ videoId, publicId, uploadSessionId, status, expiresAt, parts, nextPartNumberMarker }`; `parts` contém `{ partNumber, sizeBytes, etag }` e a evidência de checksum definida após a etapa de compatibilidade. O storage é fonte da lista de partes recebidas; a API devolve cursor até esgotar resultados.
**Error responses:** 401 autenticação; 404 `UPLOAD_SESSION_NOT_FOUND`; 410 `UPLOAD_SESSION_EXPIRED`; 503 `STORAGE_UNAVAILABLE`.

---

#### POST /videos/upload-sessions/:uploadSessionId/part-authorizations (SI-03.3.2)

**Request headers:** Authorization: Bearer; Content-Type: application/json.
**Request body:** `partNumbers`: lista não vazia de inteiros distintos e válidos para o multipart selecionado. Os campos e headers de integridade serão fixados pela etapa SI-03.1.1 antes de finalizar o DTO/OpenAPI.
**Response 200:** `{ parts: [{ partNumber, url, headers, expiresAt }] }`; autorizações válidas por até 15min e nunca além da validade da sessão. Endpoint também renova autorização de partes não concluídas; credenciais permanecem no servidor.
**Error responses:** 400 validação; 401 autenticação; 404 `UPLOAD_SESSION_NOT_FOUND`; 409 `UPLOAD_STATE_CONFLICT`; 410 `UPLOAD_SESSION_EXPIRED`; 503 `STORAGE_UNAVAILABLE`.
**Bytes:** o cliente faz PUT diretamente na URL do storage; a API recebe apenas controle. Não enviar arquivo de 10GB através de JSON, multipart/form-data na API ou buffer em memória (`phase-03-videos/TD-02`, `TD-03`).

---

#### POST /videos/upload-sessions/:uploadSessionId/completion (SI-03.4)

**Request headers:** Authorization: Bearer; Content-Type: application/json.
**Request body:** `parts`: lista ordenável de `{ partNumber, etag }`, sem duplicatas. Campos de checksum condicionados à evidência SI-03.1.1; não assumir ETag como hash do objeto.
**Response 202:** `{ videoId, publicId, status: processing }`, somente após verificar conclusão/integridade no storage e gravar estado + outbox atomicamente. Repetição retorna a mesma identidade/estado sem nova intenção de processamento; se já pronto, `200` com `status: ready`.
**Error responses:** 400 validação ou `UPLOAD_PARTS_INVALID`; 401 autenticação; 404 `UPLOAD_SESSION_NOT_FOUND`; 409 `UPLOAD_STATE_CONFLICT`; 410 `UPLOAD_SESSION_EXPIRED`; 413 `VIDEO_TOO_LARGE`; 422 `UPLOAD_INTEGRITY_MISMATCH`; 503 `STORAGE_UNAVAILABLE`.
**Recovery:** Redis indisponível após commit não transforma aceitação durável em perda de trabalho; outbox aguarda relay. Storage concluído com commit interrompido será reconciliado. Falhas de integridade/tamanho nunca enfileiram processamento e agendam limpeza do objeto (`phase-03-videos/TD-03`, `TD-05`).

---

#### DELETE /videos/upload-sessions/:uploadSessionId (SI-03.3.3 / SI-03.7)

**Request headers:** Authorization: Bearer.
**Request body:** nenhum.
**Response 204:** aborta sessão ativa e remove multipart pendente; repetição de aborto concluído é idempotente. Não apaga o rascunho nem cancela processamento já aceito.
**Error responses:** 401 autenticação; 404 `UPLOAD_SESSION_NOT_FOUND`; 409 `UPLOAD_STATE_CONFLICT` quando conclusão/processamento já venceu a disputa; 503 `STORAGE_UNAVAILABLE`. Em falha externa, persistir intenção de limpeza recuperável.

---

#### GET /videos/:publicId/processing (SI-03.6)

**Request headers:** Authorization: Bearer.
**Response 200:** `{ publicId, status, metadata, error }`; `status` reflete estado técnico persistido; `metadata` é nullable até disponível; `error` é nullable ou `{ error, message, retryable }`, com códigos estáveis sanitizados. Não emitir percentual artificial. `ready` exige metadados, thumbnail e mídia disponíveis.
**Error responses:** 401 autenticação; 404 `VIDEO_NOT_FOUND`. Sem SSE nesta entrega (`phase-03-videos/TD-11`).

---

#### POST /videos/:publicId/playback-authorizations (SI-03.6.1)

**Request headers:** Authorization: Bearer.
**Request body:** nenhum.
**Response 200:** `{ publicId, url, expiresAt, contentType: "video/mp4" }`; URL assinada de até 15min para o derivado MP4 H.264/AAC com faststart. Cada emissão reautoriza proprietário. `Range` é enviado ao storage, que deve responder `206` e `Content-Range` corretos, sem passar os bytes pela API.
**Error responses:** 401 autenticação; 404 `VIDEO_NOT_FOUND`; 409 `VIDEO_NOT_READY`; 503 `STORAGE_UNAVAILABLE`.

---

#### POST /videos/:publicId/download-authorizations (SI-03.6.2)

**Request headers:** Authorization: Bearer.
**Request body:** nenhum.
**Response 200:** `{ publicId, url, expiresAt }`; URL assinada de até 15min para o original validado, com `Content-Disposition: attachment` e nome sanitizado. Manter original e derivado enquanto o vídeo existir. Não oferecer objetos com validação pendente ou falha.
**Error responses:** 401 autenticação; 404 `VIDEO_NOT_FOUND`; 409 `VIDEO_NOT_READY`; 503 `STORAGE_UNAVAILABLE`.
**Thumbnail:** quando exposta como metadado de vídeo pronto, gerar autorização privada com a mesma verificação do proprietário; nenhuma chave/bucket passa a público (`phase-03-videos/TD-10`).

#### Validation Rules

- Aplicar DTOs com `class-validator`/`class-transformer` e ValidationPipe herdado; nenhum controller executa regras de domínio ou acessa storage diretamente (`phase-02-auth/TD-06`).
- Limite 10GB decimal, duas sessões ativas por usuário, 24h por sessão e 15min por autorização são defaults configuráveis. Conferir tamanho real e integridade antes do enqueue; não prometer bloqueio prévio de todo byte excedente (`phase-03-videos/TD-03`).
- SI-03.1.1 deve provar algoritmo/headers de checksum em partes e objeto completo, incluindo payload corrompido. Registrar evidências e semântica OpenAPI antes de fechar as superfícies de assinatura/conclusão; este plano não afirma algoritmo nem compatibilidade já comprovada (revisão `phase-03-videos/TD-03`).
- Toda operação com sessão/vídeo resolve propriedade a partir do canal/usuário autenticado; identificador público não concede autorização. Upload de outro proprietário retorna o mesmo 404 de recurso ausente.

---

### Authorization Matrix

Aplicar autenticação existente com guards próprios; não introduzir Passport, conforme nota de implementação em `phase-02-auth/TD-02`. A identificação do proprietário pertence ao domínio de canais; os serviços de vídeos/uploads não criam usuários/canais por conta própria.

| Endpoint | Anonymous | Authenticated, other owner | Owner |
|----------|-----------|-----------------------------|-------|
| POST /videos/upload-sessions | ✗ 401 | Apenas recursos do próprio canal | ✓ |
| GET /videos/upload-sessions/:uploadSessionId | ✗ 401 | ✗ 404 | ✓ |
| POST /videos/upload-sessions/:uploadSessionId/part-authorizations | ✗ 401 | ✗ 404 | ✓ enquanto ativa |
| POST /videos/upload-sessions/:uploadSessionId/completion | ✗ 401 | ✗ 404 | ✓ conforme estado |
| DELETE /videos/upload-sessions/:uploadSessionId | ✗ 401 | ✗ 404 | ✓ conforme estado |
| GET /videos/:publicId/processing | ✗ 401 | ✗ 404 | ✓ |
| POST /videos/:publicId/playback-authorizations | ✗ 401 | ✗ 404 | ✓ quando pronto |
| POST /videos/:publicId/download-authorizations | ✗ 401 | ✗ 404 | ✓ quando pronto |

URLs assinadas são capacidades temporárias para um objeto/operação; emissão exige proprietário, mas o storage não consulta a sessão JWT em cada byte. Revogar login não revoga automaticamente uma URL emitida. Não registrar URLs/assinaturas/credenciais em logs. Token público estável não é segredo de autorização (`phase-03-videos/TD-09`, `TD-10`).

### Error Catalog

Preservar o envelope herdado `{ statusCode, error, message }`; `error` contém o código de domínio e filtros HTTP mapeiam exceções do domínio (`phase-02-auth/TD-07`). Códigos novos abaixo são definidos por este plano; reutilizar os códigos de autenticação/validação já existentes, sem substituí-los. Erros do storage/fila/FFmpeg não vazam stack, argumentos, paths ou segredos.

| error | HTTP | Trigger |
|-------|------|---------|
| IDEMPOTENCY_CONFLICT | 409 | Mesma chave do proprietário com fingerprint diferente |
| UPLOAD_SESSION_LIMIT | 409 | Terceira reserva de sessão ativa do mesmo proprietário |
| VIDEO_TOO_LARGE | 413 | Tamanho declarado ou recebido excede 10.000.000.000 bytes |
| UPLOAD_SESSION_NOT_FOUND | 404 | Sessão ausente ou de outro proprietário |
| UPLOAD_SESSION_EXPIRED | 410 | Sessão pertencente ao solicitante vencida |
| UPLOAD_STATE_CONFLICT | 409 | Operação incompatível com estado ou disputa abortar/concluir |
| UPLOAD_PARTS_INVALID | 400 | Partes ausentes, duplicadas, inconsistentes com storage ou fora dos limites |
| UPLOAD_INTEGRITY_MISMATCH | 422 | Evidência de integridade diverge após validação compatível comprovada |
| VIDEO_NOT_FOUND | 404 | Vídeo ausente ou de outro proprietário |
| VIDEO_NOT_READY | 409 | Artefato solicitado ainda não pode ser entregue |
| STORAGE_UNAVAILABLE | 503 | Falha transitória do storage impede operação de controle |

Falhas assíncronas persistidas usam o campo `error` da consulta de processamento: `MEDIA_INVALID` para rejeição definitiva, `PROCESSING_RESOURCE_LIMIT` para limite de execução e `PROCESSING_FAILED` após esgotar tentativas transitórias. Sua consulta retorna HTTP 200 com estado `error`, não 500 por falha histórica do job. Campo `retryable` distingue a natureza da falha; não cria endpoint de retry manual nesta fase (`phase-03-videos/TD-05`, `TD-06`, `TD-11`).

### Events/Messages

#### video.processing.requested (SI-03.4 / SI-03.4.1 / SI-03.5.1)

**Payload:**

```json
{ "eventId": "uuid", "videoId": "uuid", "processingVersion": 1 }
```

**Producer:** serviço de conclusão de upload grava `ProcessingOutbox` na transação PostgreSQL; relay publica após commit (`phase-03-videos/TD-05`).
**Consumer:** worker NestJS em serviço Compose separado, com módulos de processamento e persistência reutilizados (`phase-03-videos/TD-06`).
**Trigger:** upload concluído no storage, tamanho e integridade verificados; persistir vídeo `processing` e intenção atomicamente.
**Delivery semantics:** at-least-once. Relay recupera lease vencido e repete publicação não confirmada; `jobId` estável auxilia deduplicação, mas a persistência e os efeitos do consumidor também são idempotentes. Não usar transação distribuída nem prometer exactly-once (`phase-03-videos/TD-05`).

**Worker execution:**

1. Recarregar vídeo e versão na persistência; descartar geração antiga ou trabalho já concluído. Proteger execução concorrente e finalização repetida por comparação de estado/versão.
2. Resolver somente chaves internas controladas pelo sistema; transferir original para área temporária isolada com orçamento de disco. Nenhuma URL arbitrária ou nome de arquivo do usuário vira comando.
3. Executar ffprobe e FFmpeg por subprocessos com array de argumentos e sem shell; impor limites configurados de CPU, memória, disco e tempo, concorrência inicial de um job por worker. Encerrar subprocesso e limpar temporários em timeout/falha/reinício.
4. Inspecionar/decodificar MP4/MOV válidos; extrair duração e metadados, gerar thumbnail e derivado MP4 H.264/AAC com faststart. Copiar streams apenas quando compatíveis e seguro; mídia sem áudio permanece sem trilha de áudio. Não criar HLS ou múltiplas rendições (`phase-03-videos/TD-07`, revisão aprovada).
5. Gravar artefatos privados em chaves por vídeo/geração. Marcar `ready` somente após metadados, thumbnail e derivado disponíveis. Falha anterior à finalização não expõe conjunto parcial; reconciliar artefatos órfãos.
6. Aplicar até três tentativas totais com backoff limitado para falhas transitórias; mídia inválida é permanente. Persistir erro final sanitizado, liberar recursos e manter rascunho privado. Tentativas do relay não consomem o orçamento do worker.

#### Reconciliação de uploads e outbox (SI-03.7)

**Producer:** rotina periódica no backend/worker, sem abrir novo endpoint público.
**Consumer:** serviços de uploads, storage e outbox, cada um responsável por suas alterações.
**Trigger:** sessões `initiating` interrompidas, upload vencido/abortado/rejeitado, storage concluído antes de commit, intenção sem publicação confirmada, lease vencido ou artefato temporário órfão.
**Delivery semantics:** operações repetíveis e idempotentes. Revalidar estado/versão antes de abortar ou remover; conclusão e limpeza concorrentes não removem original aceito nem artefatos ativos. Guardar original validado e derivado enquanto o vídeo existir (`phase-03-videos/TD-03`, `TD-05`, `TD-08`, `TD-10`).

---

## Dependency Map

```text
SI-03.1 — Infraestrutura (root)
├── SI-03.1.1 — Storage e compatibilidade
│   ├── SI-03.3 — Início de upload (também depende de SI-03.2)
│   │   ├── SI-03.3.1 — Retomada
│   │   │   └── SI-03.3.2 — Assinatura de partes
│   │   └── SI-03.3.3 — Aborto
│   │       └── SI-03.4 — Conclusão (também depende de SI-03.3.2)
│   │           └── SI-03.4.1 — Relay da outbox
│   └── SI-03.5 — Pipeline de mídia
├── SI-03.2 — Persistência e módulos
└── SI-03.5.1 — Consumidor (depende de SI-03.4.1 + SI-03.5)
    ├── SI-03.6 — Estado e serviço de entrega
    │   ├── SI-03.6.1 — Reprodução
    │   └── SI-03.6.2 — Download
    └── SI-03.7 — Reconciliação (também depende de SI-03.3.3 + SI-03.4.1)
        └── SI-03.8 — Fechamento (também depende de SI-03.6.1 + SI-03.6.2)
```

O algoritmo de checksum e seus headers devem estar comprovados em SI-03.1.1 antes dos contratos de upload. As dependências de cada SI são a lista completa; os ramos mostram compartilhamento de pré-requisitos, sem impor ordem entre irmãos independentes. Nenhum SI implementa frontend.

---

## Deliverables

- [ ] SI-03.1 — Preparar infraestrutura e dependências
- [ ] SI-03.1.1 — Implementar storage e comprovar integridade multipart
- [ ] SI-03.2 — Persistir vídeos, sessões e outbox
- [ ] SI-03.3 — Iniciar upload com rascunho idempotente
- [ ] SI-03.3.1 — Consultar sessão e partes para retomada
- [ ] SI-03.3.2 — Assinar e renovar autorizações de partes
- [ ] SI-03.3.3 — Abortar sessão sem apagar o rascunho
- [ ] SI-03.4 — Concluir upload e registrar intenção durável
- [ ] SI-03.4.1 — Publicar outbox com relay recuperável
- [ ] SI-03.5 — Inspecionar mídia e produzir artefatos privados
- [ ] SI-03.5.1 — Consumir jobs com idempotência e estado persistido
- [ ] SI-03.6 — Consultar estado técnico e preparar entrega autorizada
- [ ] SI-03.6.1 — Autorizar reprodução progressiva
- [ ] SI-03.6.2 — Autorizar download do original validado
- [ ] SI-03.7 — Reconciliar sessões e limpar recursos abandonados
- [ ] SI-03.8 — Validar 10GB e fechar documentação e DoD

**Full test suites:**

Comandos executados a partir de `nestjs-project/`, com npm/npx exclusivamente no container e banco de teste isolado. Os comandos abaixo são verificações futuras, ainda não executadas por este planejamento.

- [ ] Unitários e integração passam: `docker compose exec nestjs-api npm test -- --runInBand`.
- [ ] Integração real passa: `docker compose exec nestjs-api npm run test:integration`.
- [ ] E2E HTTP passa: `docker compose exec nestjs-api npm run test:e2e -- --runInBand`.
- [ ] TypeScript passa: `docker compose exec nestjs-api npx tsc --noEmit`.
- [ ] Lint passa: `docker compose exec nestjs-api npm run lint`.
- [ ] Build e assets passam: `docker compose exec nestjs-api npm run build`.
- [ ] Ensaio opt-in de 10GB de SI-03.8 passa com evidência reproduzível de recursos, Range e download; verificar flag de ativação no runner entregue antes de executá-lo.
- [ ] Compose confirma prontidão de PostgreSQL (`docker compose exec db pg_isready -U streamtube`), MinIO, Redis e worker, além do processo API quando explicitamente solicitado.
- [ ] `openapi.json`, AGENTS.md raiz/subprojeto e `progress.md` refletem o código real; cada SI tem status e evidências, sem declarar implementação concluída durante o planejamento.
- [ ] `progress.md` foi inicializado antes do primeiro SI e atualizado após cada SI, incluindo evidências da verificação inicial da fundação Codex e dos MCPs Context7/PostgreSQL.
- [ ] Trabalho realizado em `feature/*` a partir de `dev`, sem commit direto em `main`; sem push implícito.
