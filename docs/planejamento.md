# Planejamento — Gotardo Finanças

Sistema de gerenciamento e planejamento financeiro familiar — **SaaS multi-tenant**
(isolamento por família), contexto brasileiro (BRL/LGPD). Este documento detalha a
visão, arquitetura e o roadmap por fases (E0.x), com escopo, tarefas e critérios
de aceite.

## 1. Visão e princípios

- **Produto**: gerenciamento financeiro familiar (contas, transações, orçamento por
  envelopes, categorias, importação de extratos, ML de categorização/anomalias).
- **Multi-tenant**: isolamento por família (`Family`), em API, banco e storage.
- **Primeiro mercado**: Brasil (moeda BRL, LGPD, instituições locais).
- **Sem nuvem no lançamento**: servidor físico (on-prem) via Docker Compose;
  caminho de migração preservado (MinIO→S3, Compose→K8s).
- **PWA-first**: a web é instalável e funciona offline para uso no dia a dia.

## 2. Arquitetura alvo

```
Browser (PWA) ──► apps/web (Next.js)
                     │  REST + JSON
                     ▼
                 apps/api (NestJS)  ◄── @gotardo/db (Prisma) ──► PostgreSQL 16
                     │  │
        Redis + BullMQ│  └── MinIO (S3) — documentos e importações
                     ▼
        services/ml (FastAPI)  — categorização e anomalias (P1)
        services/ocr (FastAPI) — OCR local, PaddleOCR (P3, adiado)
```

- **Monorepo**: pnpm workspaces + Turborepo; pacotes `apps/*`, `packages/*`, `services/*`.
- **Contratos**: `packages/shared` (enums, envelopes de API); `packages/db` (schema Prisma).
- **Fila**: BullMQ para importação/OCR/ML em background (E0.7).

## 3. Modelo de dados (Prisma)

Schema em `packages/db/prisma/schema.prisma`. Enums espelham `packages/shared`.

| Modelo               | Descrição                                                                               |
| -------------------- | --------------------------------------------------------------------------------------- |
| `Family`             | Tenant (família); moeda padrão BRL                                                      |
| `User`               | Membro; papel `OWNER/ADMIN/MEMBER/VIEWER`; pertence a uma família                       |
| `Account`            | Conta/carteira (CC, poupança, investimento, cash); saldo e instituição                  |
| `Category`           | Categoria com hierarquia (subcategorias via `parentId`)                                 |
| `Envelope`           | Envelope de orçamento; meta mensal opcional                                             |
| `EnvelopeAllocation` | Alocação (funding) de valor a um envelope em uma data                                   |
| `Transaction`        | Transação (entrada/saída/transferência); status, origem, categoria, envelope, documento |
| `Document`           | Documento-fonte (importação/OCR): chave no MinIO, texto extraído                        |
| `RecurringRule`      | Regra de recorrência (diária/semanal/mensal/anual)                                      |

Valores monetários em `DECIMAL(12,2)`. Soft-delete (`deletedAt`) em entidades
financeiras (auditoria/LGPD). Chaves estrangeiras para `familyId` em todos os
modelos de dados do tenant — base do isolamento.

## 4. Roadmap

### Concluídas

- **E0.1 — Fundação do monorepo**: workspaces, configs base (TS, ESLint flat,
  Prettier, editorconfig), health endpoints (API NestJS, ML/OCR FastAPI), página
  inicial web. Validações passando.
- **E0.3 — Docker-compose dev**: PostgreSQL 16, Redis 7, MinIO com healthchecks,
  volumes e criação automática de buckets; targets `make infra-*`.
- **E0.4 — Schema Prisma**: `packages/db` com o modelo de dados completo, migration
  inicial aplicada, client gerado.

### E0.5/E0.6 — Autenticação e isolamento por tenant (PRÓXIMA)

Objetivo: registro/login e garantia de que nenhum dado cruza famílias.

Escopo:

- Registro com criação automática da `Family` (onboarding) e primeiro usuário `OWNER`.
- Login por e-mail/senha; hash forte (argon2id ou bcrypt).
- Sessão via JWT: access token curto + refresh token (rotação e revogação).
- Guard de tenant global: toda rota resolva a família do token e restrinja queries
  por `familyId`; negação por padrão.
- Convite de membros e troca de papéis (autorização por papel).
- Criptografia/expiração de sessão, proteção contra força bruta (rate limit).

Tarefas:

1. Módulo `Auth` (NestJS): service de hash, JWT, refresh.
2. `AuthModule` com `RegisterController` e `LoginController`.
3. Guard/estratégia global + interceptor de tenant injetando `familyId` no request.
4. Middleware de rate limiting (login/registro).
5. Isolamento efetivo nos primeiros módulos de domínio (accounts).
6. Testes unitários e de integração (cruzamento de tenants deve retornar 404).

Critérios de aceite:

- Dois tenants não enxergam dados um do outro (teste automatizado).
- Rota protegida sem token → 401; token de outro tenant → 404.
- Refresh com rotação invalida tokens antigos.

Dependências: nova lib de auth (ex.: `@nestjs/jwt`, `argon2`, `@nestjs/throttler`),
campos já presentes em `User` (passwordHash, role, familyId).

### E0.7 — Fila/async (Redis + BullMQ)

- Integração BullMQ com Redis (já provisionado).
- Enfileirar jobs: importação de extrato, OCR, categorização via ML.
- Retries, backoff e dashboard (Bull Board) em dev.

### Fase de domínio (após E0.7)

- CRUD de contas, categorias e transações com isolamento de tenant.
- **Importação de extratos** (OFX/CSV) e integração com MinIO (`Document`).
- **Orçamento por envelopes**: alocações, saldo por envelope, metas.
- **Relatórios**: fluxo de caixa, por categoria, por envelope, mensal.

### Serviços ML (P1) — `services/ml`

- Categorização automática de transações (aprendizado por padrões + regras).
- Detecção de anomalias (gastos fora do padrão da família).
- Exposição via FastAPI; consumo pela API através de fila.

### OCR (P3, adiado) — `services/ocr`

- Somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR).
- Esqueleto já existe; implementação apenas na Fase 3.

### Deploy (produção)

- Docker Compose de produção (on-prem): postgres, redis, minio, api, web, ml.
- HTTPS (Caddy/Traefik), backups automatizados (pg_dump + MinIO), rotacionamento de logs.
- Migração de schema via `prisma migrate deploy`.

## 5. Decisões de produto (registro)

- **OCR adiado (P3)**: PDFs escaneados fora do MVP.
- **Sem nuvem no lançamento**: servidor físico pequeno; caminho de migração preservado.
- **BRL/LGPD**: moeda única no lançamento; mínimo necessário de dados pessoais;
  direito a exclusão (soft-delete + purga).
- **IDs opacos** (`cuid`) — evita enumeração de recursos entre tenants.

## 6. Riscos e observações

- **Isolamento de tenant** é a principal fonte de bugs graves: exigir testes de
  cruzamento em toda rota que toque dados de domínio.
- **Valores monetários**: sempre `Decimal`; nunca `float` no backend.
- **LGPD**: guardar somente dados necessários; auditoria de exclusões.
- **`packages/db/.env`** é local (ignorado no git); DATABASE_URL em produção via
  variável de ambiente real.
