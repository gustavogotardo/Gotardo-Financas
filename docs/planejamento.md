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

### Marco ALFA

Uma versão **alfa** entrega o ciclo real de uso da família: registro/login,
contas, categorias, transações manuais e orçamento por envelopes, rodando no
servidor físico (on-prem) com HTTPS. Importação de extratos, ML, OCR e PWA
avançado ficam para depois do alfa.

Sequência até o alfa (após E0.5/E0.6):

1. **E0.5/E0.6** — autenticação e isolamento por tenant.
2. **E0.8** — CRUD de contas e categorias (com isolamento).
3. **E0.9** — CRUD de transações (manual, com categorias/envelopes).
4. **E0.10** — orçamento por envelopes (alocações, saldo, metas).
5. **E0.11** — relatórios básicos (fluxo de caixa, por categoria, por envelope).
6. **E0.12** — deploy de produção (Compose on-prem, HTTPS, backups, `migrate deploy`).

> **E0.7 (fila/async)** foi implementada para a importação de extratos
> (BullMQ opcional via `REDIS_URL`); OCR e categorização via ML ficam para P1/P3.

### Concluídas

- **E0.1 — Fundação do monorepo**: workspaces, configs base (TS, ESLint flat,
  Prettier, editorconfig), health endpoints (API NestJS, ML/OCR FastAPI), página
  inicial web. Validações passando.
- **E0.3 — Docker-compose dev**: PostgreSQL 16, Redis 7, MinIO com healthchecks,
  volumes e criação automática de buckets; targets `make infra-*`.
- **E0.4 — Schema Prisma**: `packages/db` com o modelo de dados completo, migration
  inicial aplicada, client gerado.
- **E0.5/E0.6 — Autenticação e isolamento por tenant**: registro/login (argon2id),
  sessão JWT + refresh com rotação/revogação, guard global por tenant, convites e
  troca de papéis, rate limit. Correções: concessão de OWNER restrita ao OWNER,
  rotação atômica no refresh e aceite de convite em transação.
- **E0.8 — Contas e categorias**: CRUD de contas e categorias hierárquicas com
  isolamento por família; OWNER/ADMIN gerenciam, MEMBER/VIEWER leem. Proteção de
  ciclos na hierarquia e de exclusão com subcategorias. Coberta no dashboard:
  seção Contas com "+ Nova conta" e seção Categorias com "+ Nova categoria".
- **E0.9 — Transações**: CRUD manual vinculado a conta/categoria (envelope aceito
  quando existir), saldo da conta atualizado automaticamente ao confirmar
  (PENDING → CONFIRMED reverte/ajusta), fluxo de revisão por status. TRANSFER não
  altera saldo até a modelagem de conta destino. Coberta no dashboard: formulário
  de nova transação e botão "Confirmar" em transações pendentes.
- **E0.10 — Envelopes**: CRUD de envelopes (meta `targetAmount`), alocações
  (funding) e resumo por envelope `alocado − gasto` (EXPENSE confirmado);
  exclusão bloqueada com transações vinculadas.
- **E0.11 — Relatórios**: fluxo de caixa (entradas vs. saídas por período e por
  mês), gastos por categoria e por envelope, extrato por conta com saldo de
  abertura/fechamento. Apenas leitura; qualquer membro consulta.
- **E0.12 — Deploy de produção (on-prem)**: `compose.prod.yaml` (postgres, redis,
  minio, api, web, ml), HTTPS via Caddy, backups `pg_dump` → MinIO com rotação de
  logs, migrações via `prisma migrate deploy`. Conclusão do marco **ALFA**. ✅
- **E0.13 — Front-end alfa (auth + dashboard)**: login/registro, sessão com
  refresh automático, dashboard com saldo total, receitas/despesas/resultado do
  mês, contas, categorias e transações — com criação de conta, categoria e
  transação, confirmação de pendentes e navegação por mês.
- **E1.1 — Dashboard por forma de pagamento**: enum `PaymentMethod` (PIX, boleto,
  cartões, transferência, dinheiro, outro) com **backfill** dos dados legados,
  validação por enum nos DTOs, endpoint de agregação por método e período
  (incluindo transações "sem método") com isolamento por tenant, e dashboard com
  seções por forma de pagamento, subtotais do período e navegação por mês. ✅
- **E0.7 — Fila/async + importação de extratos**: BullMQ + Redis (fila opcional
  via `REDIS_URL`, fallback inline), `StorageService` (MinIO ou pasta local),
  upload de OFX/QFX/CSV com criação de transações `PENDING`/`source IMPORT`,
  dedup por FITID ou data+valor+descrição, `Document` com `errorMessage`.
  Coberto no dashboard: seção "Importar extratos" (upload + lista com status). ✅
- **P1 — Categorização automática via ML (MVP)**: `services/ml` com `/categorize`
  (regras PT-BR) e `/learn` por família (precedência + persistência em JSON);
  API grava `suggestedCategoryId` na criação manual e na importação (falha do
  ML não bloqueia); dashboard mostra "Sugerido: X" com botão "Aplicar". ✅

### E0.5/E0.6 — Autenticação e isolamento por tenant

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

### E0.7 — Fila/async (Redis + BullMQ) ✅

- BullMQ + Redis provisionados; fila **opcional** (ativa se `REDIS_URL` presente,
  senão processa inline — e2e roda sem Redis).
- **Importação de extratos OFX/QFX/CSV** (implementada): upload multipart
  (`POST /api/v1/imports`, OWNER/ADMIN), armazenamento no MinIO (`Document`),
  parse e criação de transações `PENDING` com `source IMPORT`, dedup por FITID
  ou data+valor+descrição, status `PROCESSED`/`FAILED` + `errorMessage`.
- Retries/backoff e Bull Board em dev: ainda não implementados.
- OCR e categorização via ML: **não** entram no alfa (ver P1/P3).

### E0.8 — Contas e categorias

- CRUD de `Account` e `Category` com isolamento por tenant.
- Categorias hierárquicas (subcategoria via `parentId`).
- Restrições por papel (OWNER/ADMIN gerenciam; MEMBER/VIEWER leem).

### E0.9 — Transações

- CRUD de `Transaction` (manual), vínculo com conta, categoria e envelope.
- Atualização do saldo da conta ao confirmar transação.
- Fluxo de revisão (status PENDING → CONFIRMED/REJECTED/REVIEW).

### E0.10 — Orçamento por envelopes

- `EnvelopeAllocation` (alocação/funding), saldo por envelope, metas mensais.
- Resumo por envelope (alocado − gasto).

### E0.11 — Relatórios básicos

- Fluxo de caixa (entradas vs. saídas por período).
- Gastos por categoria e por envelope.
- Extrato por conta/período.

### E0.12 — Deploy de produção (on-prem) ✅

- Docker Compose de produção (`compose.prod.yaml`): postgres, redis, minio, api, web, ml.
- HTTPS (Caddy), backups automatizados (pg_dump + MinIO), rotacionamento de logs.
- Migração de schema via `prisma migrate deploy` no start da API.
- Conclusão do marco **ALFA**. ✅

### E1.1 — Dashboard por forma de pagamento (CONCLUÍDA)

Objetivo: dividir o dashboard em **seções por forma de pagamento** — transferência,
boletos, PIX, cartão de crédito, cartão de débito, dinheiro — cada uma com
subtotal e lista das transações do período. Hoje `paymentMethod` é string livre;
passa a ser um enum padronizado.

Escopo:

- Novo enum `PaymentMethod` no schema Prisma (`PIX`, `BOLETO`, `CREDIT_CARD`,
  `DEBIT_CARD`, `TRANSFER`, `CASH`, `OTHER`), espelhado em `packages/shared`.
- `Transaction.paymentMethod` muda de `String?` para o enum; migration com
  **backfill** dos valores já cadastrados (ex.: "pix"→PIX, "boleto"→BOLETO,
  "cartão de crédito"→CREDIT_CARD, "transferência"→TRANSFER).
- Validação por enum nos DTOs de criação/edição de transação.
- Novo endpoint de agregação por forma de pagamento e período (totais por método,
  incluindo transações **sem método**), com isolamento por tenant.
- Dashboard: seções por forma de pagamento com subtotal do período, lista das
  transações de cada forma, seletor de período e navegação para o extrato completo.

Tarefas:

1. Schema: enum `PaymentMethod` + alteração do campo + migration de backfill.
2. `packages/shared`: `PaymentMethod` no enum compartilhado.
3. API: validação de enum nos DTOs; endpoint de agregação por método e período.
4. Web: dashboard com seções por forma de pagamento (subtotais, lista, período).

Critérios de aceite:

- Transação só aceita métodos do enum; dados legados migrados corretamente.
- Dashboard agrupa por forma de pagamento e mostra subtotais do período;
  transações sem método aparecem em "Outros / sem método".
- O endpoint de agregação respeita o isolamento por tenant (teste de cruzamento).

### Serviços ML (P1) — `services/ml`

- **Categorização automática** (MVP implementado): `services/ml` expõe
  `POST /categorize` com regras em português-BR e precedência de aprendizado por
  família (`POST /learn`, persistido em JSON via volume `ml-data`/`DATA_DIR`).
- A API consome o serviço (client resiliente, `ML_URL`) na criação manual de
  transação e na importação de extratos, gravando `Transaction.suggestedCategoryId`
  (sugestão exibida no dashboard com botão "Aplicar"). Indisponibilidade do ML
  não bloqueia a operação (sugestão vira `null`).
- **Detecção de anomalias** (gastos fora do padrão da família): pendente.

### OCR (P3, adiado) — `services/ocr`

- Somente texto embutido de PDF no MVP; escaneados exigem OCR local (PaddleOCR).
- Esqueleto já existe; implementação apenas na Fase 3.

### Pós-alfa (beta)

- **PWA avançado** (offline, instalação) e ajustes de UX.
- Refinamento de relatórios e painel da família.

### Ambiente de teste (alfa on-prem)

- **URL**: `http://<ip-do-servidor>/` (stack `compose.prod.yaml` / `make prod-up-local`).
- **Usuário**: `alfa@example.com`
- **Senha**: `SenhaForte123!`
- Conta criada com papel `OWNER` e dados de demonstração (2 contas, categorias e
  transações de agosto) para testar dashboard, relatórios e formulários.

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
