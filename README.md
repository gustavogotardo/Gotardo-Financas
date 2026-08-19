# Gotardo Finanças

Sistema de gerenciamento e planejamento financeiro familiar — **SaaS multi-tenant**, contexto brasileiro (BRL/LGPD). Este é o monorepo do produto.

> Planejamento detalhado (roadmap, escopo por fase e critérios de aceite):
> [docs/planejamento.md](docs/planejamento.md)

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

Próximas etapas do backlog: E0.10 (envelopes), E0.11 (relatórios), até o marco
ALFA (E0.12, deploy on-prem).

## Decisões de produto

- **SaaS multi-tenant**: isolamento por família (tenant) em API, banco e storage.
- **OCR adiado (P3)**: somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR) na Fase 3.
- **Sem nuvem no lançamento**: servidor físico pequeno; caminho de migração preservado (MinIO→S3, Compose→K8s).
