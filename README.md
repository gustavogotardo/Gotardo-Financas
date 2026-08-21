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

Fase E0.1 (fundação do monorepo) concluída: estrutura de workspaces, configs base
(TS, ESLint flat, Prettier, editorconfig), health endpoints na API, nos serviços
Python e página inicial no web, com todas as validações passando.

Fase E0.3 (docker-compose dev) concluída: infraestrutura de desenvolvimento
(PostgreSQL 16, Redis 7, MinIO) provisionada via `compose.dev.yaml`, com
healthchecks, volumes persistentes, criação automática dos buckets e targets no
Makefile (`make infra-up`). Apps e serviços Python continuam rodando no host
(`pnpm dev` / uv) para hot-reload rápido.

Fase E0.4 (schema Prisma) concluída: pacote `packages/db` com o schema do domínio
(tenant `Family`, usuários, contas, categorias hierárquicas, envelopes com
alocações, transações, documentos e regras recorrentes), enums espelhando
`packages/shared`, migration inicial aplicada no PostgreSQL e client gerado.

Fase E0.5/E0.6 (autenticação e isolamento por tenant) concluída: registro com
criação automática da família (OWNER), login, sessão com JWT + refresh token com
rotação e revogação, guard global (rotas públicas marcadas com `@Public`), rate
limit em auth, convites por token, troca de papéis, e primeiro módulo de domínio
isolado (contas). Testes e2e cobrem o cruzamento de tenants (retorna 404).

Fase E0.8 (contas e categorias) concluída: CRUD de contas e categorias
hierárquicas (subcategoria via `parentId`) com isolamento por família. Papéis:
OWNER/ADMIN gerenciam; MEMBER/VIEWER somente leem. Hierarquia protegida contra
ciclos e exclusão de categoria com subcategorias.

Fase E0.9 (transações) concluída: CRUD manual vinculado a conta/categoria, com
saldo da conta atualizado automaticamente ao confirmar (PENDING → CONFIRMED,
incluindo edição e exclusão que revertem/ajustam) e fluxo de revisão por status.
Papéis: OWNER/ADMIN gerenciam; MEMBER/VIEWER leem.

Fase E0.10 (envelopes) concluída: CRUD de envelopes com meta (`targetAmount`),
alocações/funding e resumo por envelope `alocado − gasto` (despesas confirmadas).
Papéis: OWNER/ADMIN gerenciam; MEMBER/VIEWER leem.

Fase E0.11 (relatórios) concluída: fluxo de caixa (entradas vs. saídas por
período e por mês), gastos por categoria e por envelope, e extrato por conta com
saldo de abertura/fechamento. Somente leitura, disponível a qualquer membro.

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

Backlog pós-ALFA: dashboard por forma de pagamento (E1.1), filas BullMQ
(importação/OCR/ML), OCR de comprovantes e serviços de ML
(categorização/anomalias).

## Decisões de produto

- **SaaS multi-tenant**: isolamento por família (tenant) em API, banco e storage.
- **OCR adiado (P3)**: somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR) na Fase 3.
- **Sem nuvem no lançamento**: servidor físico pequeno; caminho de migração preservado (MinIO→S3, Compose→K8s).
