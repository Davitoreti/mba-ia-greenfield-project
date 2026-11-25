---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-11-24
scope_description: "Fase 03 — backend, worker e infraestrutura para upload retomável de até 10GB, processamento, thumbnails, identidade, streaming e download."
---

# Technical Decisions — Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — API, persistência, worker e serviços Docker. Todos os TDs afetam esse subprojeto.
- `next-frontend/` — implementação excluída por solicitação do usuário; não há decisão de UI ou runtime frontend neste documento. TDs Cross-layer documentam contratos que restringem consumidores futuros.

## Origem das escolhas

Decisões fechadas em 2026-11-24 por solicitação explícita do usuário, com base no enunciado "Fase 03 — Upload e Processamento de Vídeos" anexado à conversa. Requisitos vinculantes adicionais: backend apenas; vídeos pertencem a um canal; MinIO local/S3; fila e worker reais no Compose; streaming parcial; ciclo técnico persistido; documento neste caminho e planejamento em `docs/phases/phase-03-videos/`. Limites operacionais, outbox, formato de saída e restrição de acesso ao proprietário são escolhas de engenharia justificadas nos TDs, não requisitos atribuídos ao enunciado. A autorização anônima e publicação continuam nas fases posteriores.
## Contexto e restrições herdadas

O escopo são as capacidades da fase 03 em `docs/project-plan.md`. O plano também exige retomada após falha de conexão. Publicação, edição de metadados pelo usuário, thumbnail customizada e painel pertencem à fase 04; player visual e acesso anônimo pertencem à fase 05.

- `phase-01-configuracao-base/TD-01..TD-04`: ConfigModule, Joi e configuração por domínio com `registerAs`.
- `phase-02-auth/TD-01..TD-10`: autenticação e sessões existentes, validação com class-validator/class-transformer e contrato de erros. Não substituir essas decisões.
- `openapi-docs-nestjs/TD-01..TD-03`: Swagger, artefato OpenAPI e exposição condicionada ao ambiente. Novos contratos devem seguir essa estratégia.
- `next-frontend-config-base/TD-03`: BFF estrito para chamadas à API NestJS. Upload direto no object storage não significa chamada do navegador à API; essa distinção precisa constar no contrato futuro. Não alterar o frontend nesta entrega.
- `next-frontend-openapi-typing/TD-01..TD-04`: estratégia de tipos e sincronização de contratos já decidida; não abrir outro TD de codegen.

Verificação local: lockfile contém NestJS core 11.1.16 e TypeORM 0.3.28; Compose usa PostgreSQL 17, API e Mailpit. Não há dependências de storage/fila nem domínio de vídeos em `src/`. O Dockerfile usa Node 25.6.0 e ainda não instala FFmpeg. Não foram executados containers ou benchmarks nesta pesquisa.

Context7 foi consultado para NestJS, BullMQ e AWS SDK JavaScript v3. Para NestJS 11, o serviço retornou documentação corrente, sem índice específico da versão solicitada. Os demais candidatos não estão instalados: versões finais, engines Node, peer dependencies e imagens com tags/digests devem ser conferidos antes da implementação; compatibilidade documental não equivale a integração validada.

---

## TD-01: Organização do armazenamento S3/MinIO

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** O enunciado fornecido pelo usuário fixa MinIO local em Docker, compatível com S3, e S3 como destino de produção. Provedor não é uma escolha aberta. A decisão é como separar originais e artefatos; a condição de manutenção do MinIO exige conferir uma imagem reproduzível na etapa de fixação de dependências, sem substituí-lo silenciosamente.

**Options:**

### Option A: Bucket privado único com prefixos por canal e vídeo
- Separar originais, reprodução e thumbnails por chaves geradas pelo servidor, sem usar nomes fornecidos pelo cliente como identidade.
- **Pros:** Bootstrap e configuração simples; autorização centralizada na API.
- **Cons:** Retenção e permissões por categoria exigem cuidado com prefixos.

### Option B: Buckets privados separados por categoria de artefato
- Usar buckets próprios para originais, reprodução e thumbnails.
- **Pros:** Políticas e retenção independentes.
- **Cons:** Mais configuração, provisionamento e testes sem necessidade atual de políticas diferentes.

**Recommendation:** Option A — MinIO no Compose, AWS SDK JavaScript v3 e bucket privado único, com chaves por canal/vídeo e categoria. Isso atende ao exercício com menos infraestrutura lógica e preserva migração para S3. O nome original é metadado, nunca chave confiável. O deploy de produção fica na fase 07.

**Decision:** A — MinIO local/S3 conforme enunciado; bucket privado único, prefixos por canal/vídeo e categoria de artefato.

---
## TD-02: Protocolo e contrato de upload retomável

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** A API precisa controlar autorização e conclusão sem carregar 10GB em memória. O protocolo determina tanto a API quanto a sequência do consumidor futuro. Depende do TD-01. “Sem impacto” será interpretado como ausência de transferência pesada no processo HTTP e isolamento de recursos, não impacto físico zero.

**Options:**

### Option A: Multipart S3 direto com URLs assinadas por parte
- A API autoriza a sessão; o consumidor transfere partes ao storage e solicita conclusão. A retomada consulta partes já aceitas e renova assinaturas.
- **Pros:** Retira os bytes da API/BFF; repete somente partes interrompidas.
- **Cons:** Acopla o consumidor ao multipart S3; exige CORS, persistência da sessão e tratamento de expiração.

### Option B: tus com serviço tusd e storage S3
- A API autoriza/cria o vínculo do vídeo; tusd recebe os bytes e oferece retomada por offset ao consumidor.
- **Pros:** Protocolo dedicado a retomada; reduz lógica multipart no cliente.
- **Cons:** Adiciona serviço e integração de autorização/hooks; transferência passa pelo tusd.

### Option C: Partes recebidas pela API em streaming
- O consumidor envia blocos identificados à API, que encaminha ao storage sem acumular o arquivo completo.
- **Pros:** Centraliza autenticação e inspeção; evita exposição direta do endpoint S3.
- **Cons:** Duplica tráfego no caminho da API e exige protocolo próprio; o BFF futuro também precisaria encaminhar os bytes.

**Recommendation:** Option A — melhor isola o HTTP da API para 10GB; documentar iniciar, consultar partes, renovar autorização, concluir e abortar. Controlar essas operações via autenticação existente, mantendo credenciais de storage no servidor. O cliente futuro fala com o BFF para controle e com storage para bytes. [Multipart S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) permite retransmissão de partes; [tus](https://tus.io/protocols/resumable-upload) é a alternativa quando portabilidade de retomada superar o custo de outro serviço.

**Decision:** A — multipart direto no MinIO/S3 com URLs assinadas por parte e retomada persistida.

---

## TD-03: Limites, integridade e abandono de uploads

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Tamanho declarado não prova tamanho recebido. Sessões e partes abandonadas consomem recursos; limites e expiração afetam API, storage e consumidor. Depende do TD-02.

**Options:**

### Option A: Sessões com prazo e orçamento explícitos
- Limitar tamanho, sessões ativas e duração; conferir partes e objeto concluído; abortar sessões vencidas e remover objetos rejeitados por rotina reconciliadora.
- **Pros:** Consumo limitado e recuperação previsível; retomada possui janela clara.
- **Cons:** Prazo pode interromper uploads lentos; requer limpeza e reautorização.

### Option B: Sessões renováveis por atividade
- Renovar prazo enquanto houver progresso, mantendo teto de tamanho e limite de sessões; limpar apenas após inatividade.
- **Pros:** Tolera conexões muito lentas sem reinício total.
- **Cons:** Permite retenção prolongada por atividade artificial; complica contabilização e limpeza.

**Recommendation:** Option A — adotar teto de 10.000.000.000 bytes (10GB decimal), sessão de 24h, URLs por parte de 15min renováveis dentro da sessão e até duas sessões ativas por usuário. São defaults técnicos escolhidos nesta pesquisa por delegação do usuário; o enunciado não impõe esses valores. Conferir tamanho real antes de enfileirar e usar checksum suportado pelo storage selecionado; ETag multipart não é hash universal. O teste de compatibilidade deve fixar o algoritmo antes do contrato final. Validar partes e restringir sua assinatura reduz abuso, mas o limite global também precisa de conferência no servidor e limpeza após conclusão. Não prometer bloqueio prévio de todo byte excedente por URL assinada. [AWS: multipart e integridade](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html).

**Decision:** A — 10.000.000.000 bytes, sessão de 24h, URLs de 15min renováveis, duas sessões ativas por usuário e limpeza reconciliadora. Valores definidos nesta decisão como defaults técnicos configuráveis, não impostos pelo enunciado.

---

## TD-04: Tecnologia da fila de processamento

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** A extração e preparação não devem ocupar o processo HTTP. O projeto já possui PostgreSQL, mas nenhum broker instalado.

**Options:**

### Option A: BullMQ com Redis
- Publicar jobs pela integração NestJS e consumir em worker independente.
- **Pros:** Integração oficial, retries e controle de concorrência voltados a jobs.
- **Cons:** Adiciona Redis e sua operação; banco e fila não compartilham transação.

### Option B: pg-boss com PostgreSQL
- Usar PostgreSQL para persistir e reivindicar jobs.
- **Pros:** Reutiliza infraestrutura; permite publicação em transação mediante integração correta com o acesso ao banco.
- **Cons:** Divide recursos com dados de negócio; integração NestJS e adaptação transacional precisam ser construídas.

### Option C: RabbitMQ
- Publicar mensagens duráveis e consumir com acknowledgements explícitos.
- **Pros:** Broker independente e interoperabilidade entre linguagens.
- **Cons:** Mais infraestrutura; políticas de retry e operação de jobs exigem composição adicional.

**Recommendation:** Option A — a integração [NestJS/BullMQ](https://docs.nestjs.com/techniques/queues) reduz código de coordenação para esta fase, ao custo de Redis. Se minimizar serviços for prioritário, [pg-boss](https://github.com/timgit/pg-boss) é alternativa real. [Confirms e acknowledgements RabbitMQ](https://www.rabbitmq.com/docs/confirms) não tornam efeitos externos exatamente uma vez.

**Decision:** A — BullMQ com Redis real no Compose.

---

## TD-05: Garantia de disparo e reprocessamento

**Scope:** Backend

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** Concluir no storage, gravar no PostgreSQL e publicar no broker não é uma única transação. Falhas intermediárias podem deixar vídeo sem processamento. Depende dos TDs 02 e 04.

**Options:**

### Option A: Outbox transacional e consumidor idempotente
- Confirmar recebimento no banco junto da intenção de processamento; relay publica e repete até confirmar entrega. O worker protege efeitos contra execução repetida.
- **Pros:** Falha temporária da fila não perde a intenção; publicação pode ser recuperada.
- **Cons:** Adiciona outbox e relay; ainda exige reconciliação com o storage e coleta de registros antigos.

### Option B: Publicação direta e reconciliação de pendências
- Gravar estado pendente, tentar publicar e varrer vídeos pendentes para reenfileirar.
- **Pros:** Menos estruturas; suficiente quando o estado persistido define integralmente o trabalho.
- **Cons:** Detecção de pendência e concorrência ficam mais acopladas ao domínio; recuperação depende da varredura.

**Recommendation:** Option A — tornar explícita a intenção durável entre banco e Redis; repetir jobs com backoff limitado e classificar mídia inválida como falha permanente. Adotar três tentativas para falhas transitórias. A reconciliação também deve detectar conclusão no storage seguida de queda antes do commit. Não manter transação SQL aberta durante FFmpeg. [BullMQ: idempotência](https://docs.bullmq.io/patterns/idempotent-jobs) orienta tratar efeitos repetidos; deduplicação por jobId não substitui essa proteção.

**Decision:** A — outbox transacional, relay e consumidor idempotente; até três tentativas com backoff para falhas transitórias, erro persistido após esgotamento e rejeição definitiva para mídia inválida.

---

## TD-06: Isolamento e ferramenta do processamento

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** FFmpeg já aparece na arquitetura. A decisão aberta é a fronteira de execução e como integrá-lo, não substituir o motor por preferência de biblioteca.

**Options:**

### Option A: Worker NestJS separado, executando FFmpeg/ffprobe como subprocessos
- Compartilhar módulos necessários com o backend, mas executar em serviço Docker próprio com disco temporário e recursos limitados.
- **Pros:** Reutiliza configuração e acesso a dados; separa CPU/memória da API; evita wrapper adicional.
- **Cons:** Requer empacotar binários, limitar concorrência e gerenciar subprocessos, timeout e limpeza.

### Option B: Serviço de processamento independente com contrato de mensagens
- Worker com projeto e ciclo de entrega próprios recebe identificadores e devolve resultados para a API persistir.
- **Pros:** Maior autonomia de linguagem e implantação; fronteira de domínio explícita.
- **Cons:** Introduz contrato de resultados e outra aplicação para uma única fase.

**Recommendation:** Option A — a escala atual favorece reaproveitar NestJS e TypeORM, com serviço separado e módulos focados. ffprobe fornece saída estruturada para inspeção; FFmpeg extrai frame e prepara a mídia. Aplicar limites de CPU, memória, disco e tempo; concorrência inicial um job por worker. Passar argumentos sem shell e aceitar apenas objetos controlados pelo sistema, sem URLs arbitrárias. [ffprobe](https://ffmpeg.org/ffprobe.html) e [workers BullMQ](https://docs.bullmq.io/guide/workers/stalled-jobs) fundamentam a integração e o tratamento de reinícios.

**Decision:** A — worker NestJS em container separado, FFmpeg/ffprobe em subprocessos, concorrência inicial de um job e recursos limitados.

---

## TD-07: Formato de reprodução e normalização

**Scope:** Backend

**Capability:** Reprodução via streaming (sem necessidade de download completo)

**Context:** Extrair metadados não torna qualquer codec reproduzível no navegador. Não há requisito de bitrate adaptativo ou múltiplas resoluções; escolher essa capacidade agora ampliaria custo de processamento e armazenamento.

**Options:**

### Option A: Restringir entrada a MP4 H.264/AAC e preparar faststart
- Validar codecs reais, rejeitar formatos incompatíveis e reorganizar o MP4 quando necessário.
- **Pros:** Menor consumo de CPU e pipeline enxuto; reprodução progressiva com Range.
- **Cons:** Usuário precisa converter arquivos incompatíveis; container MP4 sozinho não garante compatibilidade.

### Option B: Normalizar para MP4 H.264/AAC progressivo
- Aceitar uma lista documentada de formatos e gerar uma saída compatível; copiar streams apenas quando compatíveis e seguro.
- **Pros:** Experiência mais previsível para uploads de origens diferentes; um artefato de reprodução.
- **Cons:** Transcodificação pode ser lenta; exige orçamento de recursos e espaço adicional.

### Option C: HLS com múltiplas rendições
- Produzir playlists e segmentos para reprodução adaptativa.
- **Pros:** Adaptação de qualidade à conexão.
- **Cons:** Multiplica artefatos, CPU e integração futura do player; vai além da reprodução mínima exigida.

**Recommendation:** Option B — uma saída progressiva compatível equilibra diversidade de entrada e simplicidade do consumidor futuro; HLS adaptativo fica para necessidade comprovada. Adotar MP4 e MOV como containers iniciais, sujeitos a inspeção e decodificação reais. Escolher codecs/parâmetros finais com fixtures de navegadores na implementação. faststart reorganiza o índice, não converte codecs nem substitui suporte a Range. [FFmpeg: formatos e MP4](https://ffmpeg.org/ffmpeg-formats.html).

**Decision:** B — normalizar MP4/MOV válidos para MP4 H.264/AAC progressivo com faststart; reutilizar streams compatíveis quando possível. HLS e múltiplas resoluções ficam fora do escopo.

---

## TD-08: Rascunho, sessão de upload e estado técnico

**Scope:** Backend

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** Rascunho descreve o estado editorial; upload interrompido e processamento descrevem estados técnicos. Misturá-los impediria distinguir vídeo pronto ainda não publicado de upload incompleto. A publicação permanece na fase 04.

**Options:**

### Option A: Vídeo rascunho e sessão técnica separada
- Criar o vídeo ao iniciar e associar uma sessão de upload com identidade e expiração próprias; manter estado de processamento independente do editorial.
- **Pros:** Retomada e expiração não redefinem identidade do vídeo; facilita rastrear tentativas.
- **Cons:** Mais persistência e regras de transição; exige compensar falha ao iniciar no storage.

### Option B: Um registro de vídeo com todos os estados
- Manter identificadores de upload e estados técnicos diretamente no vídeo, com estado editorial separado no mesmo registro.
- **Pros:** Menos tabelas e consultas para a primeira versão.
- **Cons:** Histórico e novas tentativas ficam difíceis; aumenta acoplamento entre ciclo do arquivo e do vídeo.

**Recommendation:** Option A — preservar o rascunho como identidade estável e tratar a sessão como recurso descartável. Repetição da solicitação inicial com a mesma chave de idempotência deve devolver o mesmo resultado no escopo do proprietário; falha antes da criação no storage precisa ser recuperável. Um vídeo pronto continua rascunho e privado nesta fase. Eventos de armazenamento nunca publicam conteúdo automaticamente.

**Decision:** A — vídeo ligado ao canal, sessão de upload separada e estado técnico persistido: rascunho durante upload, processando após conclusão verificada, pronto após metadados/thumbnail/mídia disponíveis e erro após falha definitiva. Publicação editorial permanece separada e futura.

---

## TD-09: Identificador curto e URL estável do vídeo

**Scope:** Cross-layer

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** O plano pede URL curta sem colisão observável. A identidade não pode depender de título ou URL assinada do arquivo, pois ambos mudam. A rota visual será implementada em fase posterior.

**Options:**

### Option A: Identificador público aleatório curto com unicidade no banco
- Gerar token criptográfico URL-safe separado da chave interna, com índice UNIQUE e nova tentativa em colisão.
- **Pros:** Curto, estável e não sequencial; não expõe a chave interna.
- **Cons:** Requer geração e tratamento de colisão; aleatoriedade sozinha não garante unicidade.

### Option B: Chave sequencial codificada em base62
- Representar a sequência única do banco em formato compacto.
- **Pros:** Curto e sem colisões no mesmo espaço de sequência.
- **Cons:** Enumerável e expõe ordenação/volume aproximado; eventual migração de sequência exige cuidado.

### Option C: UUID público
- Reutilizar UUID v4 como identidade externa.
- **Pros:** Formato conhecido e fácil geração; integração direta com PostgreSQL.
- **Cons:** URL maior; também precisa de restrição de unicidade, apesar da probabilidade pequena de colisão.

**Recommendation:** Option A — adotar token de 12 caracteres base64url gerado com fonte criptográfica, UNIQUE e retry limitado; falhar sem expor duplicata se esgotar tentativas. O contrato devolve identidade estável independente da localização do objeto. Não tratar token como autorização nem criar agora a página da fase 05. [PostgreSQL: unicidade](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) é a garantia final, não a probabilidade do gerador.

**Decision:** A — identificador público criptográfico base64url de 12 caracteres, UNIQUE no banco e até cinco tentativas em colisão; nunca retornar identidade duplicada.

---

## TD-10: Entrega autorizada de streaming e download

**Scope:** Cross-layer

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** O rascunho precisa continuar privado. Entregar bytes e autorizar acesso são responsabilidades diferentes. Depende dos TDs 01 e 07; o público anônimo e as regras público/unlisted serão acrescentados nas fases 04/05.

**Options:**

### Option A: API autoriza e emite URLs temporárias para storage privado
- O consumidor obtém uma autorização e acessa o objeto diretamente; streaming usa Range e download usa Content-Disposition apropriado.
- **Pros:** Não ocupa conexões da API com vídeo; separa autorização de transferência.
- **Cons:** URL funciona como credencial até expirar; exige endpoint acessível ao consumidor e renovação em novos pedidos após expiração.

### Option B: API faz proxy em streaming
- A API verifica permissão em cada pedido e encaminha bytes com suporte a Range e cancelamento.
- **Pros:** Controle imediato de acesso; esconde detalhes do storage.
- **Cons:** Tráfego e conexões passam pela API/BFF; precisa preservar corretamente respostas parciais e cabeçalhos.

**Recommendation:** Option A — entregar apenas ao proprietário autenticado nesta fase; URLs curtas em validade, não registradas em logs. Adotar validade inicial de 15min renovável, preservando identidade estável separada. Para download, oferecer o original validado; reprodução usa o derivado do TD-07. Isso implica manter ambos enquanto o vídeo existir e documentar custo adicional. Preservar origem privada também para thumbnails de rascunhos. A [documentação S3 de URLs assinadas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) explica validade e uso das credenciais do emissor. A aplicação deve reautorizar novos acessos; revogar sessão do usuário não revoga automaticamente uma URL já emitida.

**Decision:** A — storage privado, autorização do proprietário e URLs assinadas de 15min; reprodução progressiva com Range/206 e download do original validado com Content-Disposition attachment.

---

## TD-11: Contrato de acompanhamento do processamento

**Scope:** Cross-layer

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** O consumidor precisa distinguir arquivo recebido, trabalho pendente, processamento concluído e falha, mesmo após desconectar. Não será implementada interface nesta fase.

**Options:**

### Option A: Consulta HTTP do estado persistido
- Disponibilizar recurso autenticado que devolve estado e resultado, consultável periodicamente pelo consumidor.
- **Pros:** Retomada simples; funciona com BFF e não requer conexões permanentes.
- **Cons:** Atualização tem atraso e gera consultas repetidas.

### Option B: SSE com consulta de recuperação
- Enviar eventos de mudança ao consumidor e manter consulta HTTP como fonte de verdade após desconexão.
- **Pros:** Atualizações rápidas com fluxo unidirecional.
- **Cons:** Adiciona conexões persistentes, reconexão e encaminhamento no BFF futuro.

**Recommendation:** Option A — começar com estado persistido e erro estável no contrato OpenAPI, sem percentual artificial de FFmpeg. A consulta deve autorizar proprietário e distinguir falha recuperável de rejeição definitiva. Não criar novo padrão de erros nem outra estratégia de geração de tipos. SSE passa a ser justificável se a latência de atualização virar requisito; [EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html) define o transporte alternativo.

**Decision:** A — consulta HTTP autenticada do estado persistido, metadados disponíveis e erro estável, conforme OpenAPI existente.

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Backend | Organização do armazenamento | A — bucket privado com prefixos | A |
| TD-02 | Cross-layer | Upload retomável | A — multipart direto assinado | A |
| TD-03 | Cross-layer | Limites e abandono | A — sessões com prazo e orçamento | A |
| TD-04 | Backend | Fila | A — BullMQ/Redis | A |
| TD-05 | Backend | Disparo e reprocessamento | A — outbox e idempotência | A |
| TD-06 | Backend | Execução do processamento | A — worker separado e subprocessos | A |
| TD-07 | Backend | Reprodução | B — normalizar MP4 progressivo | B |
| TD-08 | Backend | Ciclo de vida | A — rascunho e sessão separados | A |
| TD-09 | Cross-layer | URL única | A — token curto e UNIQUE | A |
| TD-10 | Cross-layer | Entrega e download | A — URLs temporárias e storage privado | A |
| TD-11 | Cross-layer | Acompanhamento | A — consulta HTTP | A |

## Validação a levar ao planejamento

Estas são verificações futuras, não evidências de implementação:

- Upload: limite exato e um byte acima; tamanho declarado divergente; partes ausentes/duplicadas; assinatura vencida; retomada após conexão interrompida e reinício da API; tentativa de concluir sessão alheia.
- Consistência: repetir início/conclusão; queda após conclusão no storage e antes do commit; Redis indisponível; queda após publicação e antes da confirmação; worker reiniciado durante escrita de artefatos; recuperação sem duplicar efeitos.
- Processamento: mídia inválida, truncada, áudio sem vídeo e codecs incompatíveis; extração de duração e frame; rotação/orientação; timeout; limite de disco; limpeza de arquivos temporários em sucesso e falha.
- Entrega: rascunho inacessível a terceiros, inclusive thumbnail; expiração e renovação; Range válido (206), inválido (416), seek e início sem baixar tudo; download do original com nome seguro e disposição correta.
- Compatibilidade real de storage: multipart, listagem paginada de partes, abort, assinatura, CORS/ETag, checksum escolhido, Range e overrides de resposta. Não presumir suporte integral de IAM ou lifecycle S3 na versão fixada do MinIO. Agendar limpeza pela aplicação se a operação necessária não existir no provedor.
- Recursos: teste real de 10GB separado das fixtures pequenas da suíte; medir memória/latência da API e disco/CPU do worker sob upload e processamento. Definir baseline e orçamento no plano de implementação; não declarar performance validada sem medição.
- Infraestrutura: comunicação entre containers por nomes dos serviços. URLs destinadas ao consumidor usam endereço alcançável externamente; assinar com o host correto, sem trocar host depois da assinatura. Separar endpoint interno e de assinatura quando necessário.

Na implementação, seguir a pirâmide de testes existente: unitários para regras, integração real para persistência/storage/fila e E2E HTTP para o fluxo. Executar as suítes afetadas e depois suíte completa, typecheck e lint conforme AGENTS.md. Esta entrega documental não cria endpoints, schemas finais, migrations, serviços ou dependências.

## Próximo passo

Executar `/plan-context phase-03-videos`, seguido de `plan-validate` e `plan-resolve` para o mesmo escopo. As escolhas acima foram fechadas por delegação explícita do usuário. Prosseguir com contexto, validação e fixação das versões em library-refs.md antes de gerar o plano e implementar; esta decisão não declara a fase implementada ou validada.
