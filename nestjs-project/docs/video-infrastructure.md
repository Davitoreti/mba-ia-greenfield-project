# Infraestrutura de vídeos — SI-03.1

## Distribuição e licença

Por aprovação do usuário em 2026-11-26, o storage local usa **MinIO AIStor Free**, em um único nó. S3 continua como destino de produção. A versão validada por `minio --version` é `RELEASE.2026-09-19T17-05-25Z`, commit `cea38c7e83d1ebafea7b9b5d1be53878deaa9772`. O Compose fixa o digest `sha256:107cf2014a9583c74c11e3cdbd6903d89c2244355886b89ce532f4ecae9c23f3` da imagem oficial `quay.io/minio/aistor/minio`.

Obtenha a licença gratuita em <https://www.min.io/pricing> e salve-a em `nestjs-project/.secrets/minio.license`. Alternativamente, configure `MINIO_LICENSE_PATH` no `.env` com o caminho local. O Compose monta o arquivo como secret somente leitura; `.gitignore` e `.dockerignore` excluem licenças e `.secrets`. Não copie a licença para código, logs ou imagens. As credenciais `minioadmin` são defaults exclusivamente locais; substitua `STORAGE_ACCESS_KEY_ID` e `STORAGE_SECRET_ACCESS_KEY` em ambientes compartilhados.

Referência oficial: <https://docs.min.io/aistor/installation/container/install/>. Sem licença válida, não é possível confirmar as operações S3 nem concluir este SI.

## Inicialização

Execute a partir de `nestjs-project/`:

```powershell
docker compose config --quiet
docker compose build video-worker
docker compose up -d db mailpit nestjs-api redis minio video-worker
docker compose ps
docker compose exec db pg_isready -U streamtube
docker compose exec redis redis-cli -h redis ping
docker compose exec minio curl --fail --silent http://minio:9000/minio/health/ready
docker compose logs video-worker
```

`nestjs-api` continua sendo o container de desenvolvimento: não inicia o servidor HTTP automaticamente. Para servir a API, executar `docker compose exec nestjs-api npm run start:dev` somente quando solicitado. O worker usa `NestFactory.createApplicationContext`, sem controllers nem socket HTTP. Os logs de bootstrap confirmam as versões de FFmpeg/ffprobe, os encoders `libx264`/`aac` e uma consulta real à fila. Neste SI ainda não há consumidor de jobs; ele será entregue no SI-03.5.1.

O healthcheck do worker verifica que o PID registrado após o bootstrap continua vivo. A saúde corrente do Redis é observada pelo healthcheck separado do serviço Redis. Esse sinal não afirma que um vídeo já pode ser processado. MinIO possui healthcheck HTTP próprio. O worker aguarda MinIO e Redis saudáveis no Compose.

## Rede e persistência

- Internamente: `db`, `redis` e `http://minio:9000`, sempre nomes Compose.
- MinIO publica API em 9000 e console em 9001. Redis não publica porta no host.
- `STORAGE_ENDPOINT` é usado nas chamadas internas. `STORAGE_SIGNING_ENDPOINT` é usado para assinar URLs que o consumidor precisa resolver. O default `http://minio:9000` funciona na rede Compose; para consumidores no host, configure resolução local do nome `minio` para o host Docker ou use outro hostname externo resolvível. Nunca reescreva o host de uma URL depois da assinatura.
- `minio-data` guarda objetos; `redis-data` guarda AOF; `worker-temp` guarda temporários fora da memória da API. `docker compose down` preserva esses volumes; `down -v` remove os dados.
- Redis usa AOF, `appendfsync everysec` e `noeviction`. Há uma janela de perda de até aproximadamente um segundo em falha abrupta; a outbox e a recuperação durável pertencem aos próximos SIs.
- A criação/configuração do bucket privado, CORS e comprovação multipart/checksum pertencem ao SI-03.1.1. A disponibilidade da imagem não comprova esses contratos.

## Orçamentos iniciais

| Recurso | Default | Controle e critério |
| --- | --- | --- |
| CPU do worker | 2 CPUs | Limite cgroup via `VIDEO_WORKER_CPUS`; reserva capacidade para API/DB |
| Memória do worker | 2 GiB | Limite cgroup via `VIDEO_WORKER_MEMORY_LIMIT`; transferência de mídia deverá usar streams |
| Concorrência | 1 job | `VIDEO_WORKER_CONCURRENCY=1`, validado por Joi; não elevar antes de medir fixtures |
| Threads FFmpeg | 2 | `VIDEO_FFMPEG_THREADS`; o pipeline deverá passar o valor ao subprocesso |
| Tempo por processamento | 3.600.000 ms | `VIDEO_PROCESSING_TIMEOUT_MS`; encerramento do subprocesso será implementado no pipeline |
| Temporários | 24 GiB | `VIDEO_TEMP_BUDGET_BYTES=25769803776`; volume em disco, cobrindo original decimal de 10 GB, derivado e margem |
| MinIO | 2 GiB RAM | `MINIO_MEMORY_LIMIT`, separado do processo API |
| Redis | 512 MiB RAM / 384 MiB de dados | Limite cgroup e `maxmemory`; `noeviction` impede perda silenciosa de jobs por expulsão |

O orçamento temporário é configuração de admissão para o pipeline do SI-03.5, **não uma quota física do volume Docker**. O pipeline deverá verificar espaço livre, contabilizar bytes e limpar temporários. Reserve pelo menos 24 GiB livres no disco Docker antes do ensaio de 10 GB. Os limites de timeout e threads também serão aplicados aos subprocessos no SI-03.5; neste SI existem configuração validada e isolamento do container.

Antes de ampliar os defaults, medir `docker stats --no-stream`, tempo total, pico de disco (`du`/`df` no worker), latência HTTP da API e presença de OOM com fixtures MP4/MOV representativas. Repetir sob o ensaio opt-in de 10 GB do SI-03.8. Ajustar memória/timeout/disco com base nos picos e margem observada, mantendo concorrência um até comprovar capacidade.

## Imagem do worker

`Dockerfile.worker` usa Node `25.6.0-bookworm-slim` com digest fixo e FFmpeg/ffprobe do pacote Debian `7:5.1.9-0+deb12u1`. Build e runtime são separados; o runtime roda como `node`, com init para encaminhamento de sinais e sem portas publicadas. A imagem deve ser reconstruída após alterações de código ou dependências. Se a versão Debian fixada deixar de estar disponível, o build falha em vez de trocar silenciosamente a versão; atualizar explicitamente e verificar codecs antes de continuar.

Todos os comandos npm/npx/Node de desenvolvimento e validação são executados nos containers. Testes que usam PostgreSQL devem definir **ambos** `DB_NAME=streamtube_test` e `DB_DATABASE=streamtube_test`; o banco de desenvolvimento não deve ser usado para testes destrutivos.
