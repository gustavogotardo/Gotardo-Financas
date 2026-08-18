# Gotardo Finanças

Sistema de gerenciamento e planejamento financeiro familiar — **SaaS multi-tenant**, contexto brasileiro (BRL/LGPD). Este é o monorepo do produto.

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
- **Fila/async**: Redis + BullMQ (próxima etapa)
- **Banco**: PostgreSQL 16 + Prisma (próxima etapa)
- **Documentos**: MinIO, S3-compatível (próxima etapa)
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

# validações Python
make py-test
make py-lint

# formatação
pnpm format
```

## Estado atual

Fase E0.1 (fundação do monorepo) concluída: estrutura de workspaces, configs base
(TS, ESLint flat, Prettier, editorconfig), health endpoints na API, nos serviços
Python e página inicial no web, com todas as validações passando.

Próximas etapas do backlog: E0.3 (docker-compose dev), E0.4 (schema Prisma),
E0.5/E0.6 (autenticação e isolamento por tenant).

## Decisões de produto

- **SaaS multi-tenant**: isolamento por família (tenant) em API, banco e storage.
- **OCR adiado (P3)**: somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR) na Fase 3.
- **Sem nuvem no lançamento**: servidor físico pequeno; caminho de migração preservado (MinIO→S3, Compose→K8s).
