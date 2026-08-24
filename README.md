# Gotardo Finanças

Sistema de gerenciamento e planejamento financeiro familiar — **SaaS multi-tenant**, contexto brasileiro (BRL/LGPD). Este é o monorepo do produto.

> Planejamento detalhado (roadmap, escopo por fase e critérios de aceite):
> [docs/planejamento.md](docs/planejamento.md)
>
> Especificação técnica completa (30 seções, modelo de dados, API, IA, segurança, roadmap):
> [docs/especificacao-tecnica.md](docs/especificacao-tecnica.md)

## Estrutura

```
apps/
  api/          API backend (NestJS) — domínio financeiro, importação, orçamento
  web/          Aplicação web (Next.js, PWA-first)
packages/
  shared/       Tipos e contratos compartilhados (envelopes, enums, modelos)
services/
  ml/           Serviço Python (FastAPI) — ML de categorização e anomalias (P1)
  ocr/          Serviço Python (FastAPI) — OCR local (ADIADO, prioridade P3)
```

## Stack

- **Gerenciador**: pnpm (workspaces) + Turborepo
- **Backend**: NestJS (Node/TypeScript), REST + OpenAPI
- **Frontend**: Next.js + TypeScript
- **Serviços Python**: FastAPI, gerenciados com uv
- **Fila/async**: Redis + BullMQ (Redis provisionado; BullMQ na E0.7)
- **Banco**: PostgreSQL 16 + Prisma (`packages/db`)
- **Documentos**: MinIO, S3-compatível (provisionado; integração na fase de importação)
- **Deploy**: servidor físico (on-prem), Docker Compose (próxima etapa)

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Python >= 3.11
- uv (para os serviços Python)

## Comandos

```bash
# instalar dependências (raiz)
pnpm install

# instalar dependências dos serviços Python
make py-install

# desenvolvimento (api :3000, web :3001, watch)
pnpm dev

# validações TS (lint, typecheck, testes)
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# banco de dados (Prisma em packages/db)
pnpm --filter @gotardo/db db:migrate   # nova migration de desenvolvimento
pnpm --filter @gotardo/db db:deploy    # aplica migrations (prod)
pnpm --filter @gotardo/db db:studio    # Prisma Studio

# testes de integração da API (exige infra + banco gotardo_test)
make test-db-setup   # cria o banco de teste e aplica migrations

# validações Python
make py-test
make py-lint

# infraestrutura de desenvolvimento (PostgreSQL, Redis, MinIO)
cp .env.example .env   # uma vez, para ajustar credenciais/portas
make infra-up          # sobe postgres, redis e minio (minio-init cria os buckets)
make infra-ps          # status
make infra-logs        # logs
make infra-down        # para (mantém os dados)
make infra-down-volumes # para e apaga os dados

# formatação
pnpm format
```

## Estado atual

**Marco BETA concluído** (fases E0.1 a E1.6 — ver [docs/planejamento.md](docs/planejamento.md)
e [docs/especificacao-tecnica.md](docs/especificacao-tecnica.md) §23 para o detalhamento
por fase): fundação do monorepo, infraestrutura de dev via Docker Compose, schema Prisma
completo, autenticação com isolamento por tenant, CRUD de contas/categorias/transações/
envelopes, relatórios (fluxo de caixa, gastos por categoria/envelope, extrato de conta),
deploy on-prem em produção (marco ALFA, abaixo), dashboard por forma de pagamento,
importação de extratos (OFX/CSV) com fila BullMQ e MinIO, categorização automática e
detecção de anomalias via serviço de ML (`services/ml`), painel de família (convites,
papéis) e PWA instalável.

**Próxima fase: E2 — Enrichment**, iniciando pelo Épico E2.1 (importação XLSX). Ver
§30 de `docs/especificacao-tecnica.md` para os próximos passos completos.

## Deploy on-prem (E0.12 — marco ALFA)

Stack de produção via Docker Compose (`compose.prod.yaml`): postgres, redis,
minio, api, web, ml e proxy HTTPS (Caddy) com backups automáticos de banco.

```sh
cp .env.example .env        # defina DOMAIN e segredos/senhas fortes
make prod-up                # build + start da stack (após `make infra-down`)
make prod-logs              # acompanhar os logs
make prod-backup            # backup manual (pg_dump → MinIO, diário automático)
```

- HTTPS automático via Let's Encrypt para o domínio em `DOMAIN`; para rede
  interna, adicione `tls internal` em `deploy/caddy/Caddyfile`.
- Migrações aplicadas no start da API (`prisma migrate deploy`).
- Logs com rotação (`10m` × 3 por serviço).

Backlog pós-ALFA (E1.1 a E1.6) concluído desde então — ver "Estado atual" acima.
Pendente: OCR de comprovantes escaneados (Fase E4, adiada, prioridade P3).

## Decisões de produto

- **SaaS multi-tenant**: isolamento por família (tenant) em API, banco e storage.
- **OCR adiado (P3)**: somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR) na Fase 3.
- **Sem nuvem no lançamento**: servidor físico pequeno; caminho de migração preservado (MinIO→S3, Compose→K8s).
