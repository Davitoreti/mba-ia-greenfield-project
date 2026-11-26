---
libs:
  "@aws-sdk/client-s3":
    version: "3.1153.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-26T00:08:45.002801+00:00"
  "@aws-sdk/s3-request-presigner":
    version: "3.1153.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-26T00:08:45.002801+00:00"
  "bullmq":
    version: "5.81.5"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-11-26T00:08:45.002801+00:00"
  "@nestjs/bullmq":
    version: "11.0.5"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-11-26T00:08:45.002801+00:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-26T00:07:58.5264410Z"
---

## Library References — Upload e Processamento de Vídeos

### @aws-sdk/client-s3

- Uso: `S3Client`, comandos multipart (`CreateMultipartUploadCommand`, `UploadPartCommand`, `ListPartsCommand`, `CompleteMultipartUploadCommand`, `AbortMultipartUploadCommand`) e operações de objeto para storage privado.
- Configurar endpoint MinIO e assinatura com origem correta; nunca trocar o host de uma URL depois de assiná-la. Conexões internas usam nomes de serviços Compose.
- Algoritmo e headers de checksum continuam sujeitos à verificação real aprovada no TD-03; tipos/APIs da SDK não provam suporte da versão MinIO escolhida.
- Documentação Context7: [AWS SDK v3](https://github.com/aws/aws-sdk-js-v3/tree/v3.1153.0/clients/client-s3).

### @aws-sdk/s3-request-presigner

- Uso: `getSignedUrl(client, command, { expiresIn })` com autorização de até 900 segundos, limitada à sessão restante no upload.
- Headers exigidos pela assinatura devem ser devolvidos ao consumidor. A documentação descreve `unhoistableHeaders` para exigir headers `x-amz-*`; confirmar o comportamento com a combinação de checksum/provedor selecionada.
- Documentação Context7: [presigner v3.1153.0](https://github.com/aws/aws-sdk-js-v3/blob/v3.1153.0/packages/s3-request-presigner/README.md).

### bullmq

- Uso: `Queue`, `Worker` e `Job`; `attempts: 3` representa três tentativas totais. Configurar backoff para falhas transitórias e concorrência inicial de um job.
- `jobId` estável evita duplicatas enquanto o job existir na fila; remoção de jobs permite reenfileiramento. Manter idempotência na persistência e nos efeitos do worker, além da deduplicação.
- Retry do relay é separado das tentativas de processamento; a outbox é a intenção durável.
- Documentação Context7: [retry](https://github.com/taskforcesh/bullmq/blob/v5.81.5/docs/gitbook/guide/retrying-failing-jobs.md), [deduplicação por jobId](https://github.com/taskforcesh/bullmq/blob/v5.81.5/docs/gitbook/patterns/throttle-jobs.md).

### @nestjs/bullmq

- Uso: `BullModule.forRootAsync`, registro de fila e `@Processor` em classe que estende `WorkerHost` e implementa `process(job)`.
- Configuração injetada por domínio; carregar consumidor somente no bootstrap do worker, sem expor controllers HTTP nesse processo.
- Context7 informou que não possui documentação indexada específica da versão 11 e serviu a corrente. Conferir APIs e peer dependencies da versão exata antes da instalação.
- Documentação Context7: [integração NestJS/BullMQ](https://github.com/nestjs/bull).

## Versionamento e verificação antes da implementação

- O manifesto atual usa NestJS `^11.0.1` e TypeORM `^0.3.28`; os quatro pacotes novos acima ainda não estão instalados.
- Versões exatas selecionadas para instalação: AWS SDK e presigner `3.1153.0`, BullMQ `5.81.5`, integração NestJS `11.0.5`. Publicação e metadados verificados no registro npm; dependências ainda não instaladas e integração ainda não executada. AWS exige Node >=20; BullMQ declara Node >=12.22 e peer redis >=5. A integração declara NestJS core/common ^10 ou ^11 e BullMQ ^3/^4/^5/^6, cobrindo a combinação planejada.
- A consulta inicial ao registro npm no sandbox falhou; a consulta com acesso ampliado foi bem-sucedida. Metadados públicos: [AWS SDK](https://registry.npmjs.org/@aws-sdk%2fclient-s3/3.1153.0), [presigner](https://registry.npmjs.org/@aws-sdk%2fs3-request-presigner/3.1153.0), [BullMQ](https://registry.npmjs.org/bullmq/5.81.5) e [integração NestJS](https://registry.npmjs.org/@nestjs%2fbullmq/11.0.5). Instalar com versões exatas e atualizar manifesto/lockfile dentro do container no SI de infraestrutura; manter Node compatível e verificar resolução transitiva. Não usar latest silenciosamente.
- MinIO, Redis e FFmpeg/ffprobe são serviços/binários, não novos wrappers npm. Fixar tags/digests e versão dos binários na imagem do worker no SI de infraestrutura; confirmar codecs disponíveis e compatibilidade real. Não adicionar biblioteca wrapper FFmpeg por consequência deste cache.
