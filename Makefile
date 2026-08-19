PY := uv run
PATH := $(HOME)/.local/bin:$(PATH)
export PATH

.PHONY: help install test lint typecheck build format dev py-install py-test py-lint infra-up infra-down infra-down-volumes infra-logs infra-ps infra-restart test-db-setup prod-up prod-up-local prod-build prod-down prod-down-volumes prod-logs prod-ps prod-backup

help:
	@echo "Gotardo Finanças — monorepo"
	@echo ""
	@echo "Targets TS (pnpm):"
	@echo "  install       pnpm install (raiz)"
	@echo "  dev           roda api (3000) e web (3001) em watch"
	@echo "  build         turbo build"
	@echo "  lint          turbo lint (ESLint)"
	@echo "  typecheck     turbo typecheck"
	@echo "  test          turbo test (Jest)"
	@echo "  format        prettier --write"
	@echo ""
	@echo "Targets Python (uv, serviços em services/):"
	@echo "  py-install    cria .venv e instala dev de ml e ocr"
	@echo "  py-test       pytest de ml e ocr"
	@echo "  py-lint       ruff check de ml e ocr"
	@echo ""
	@echo "Infra (docker compose dev — postgres, redis, minio):"
	@echo "  infra-up      sobe a infraestrutura em segundo plano"
	@echo "  infra-logs    acompanha os logs da infraestrutura"
	@echo "  infra-ps      status dos serviços de infraestrutura"
	@echo "  infra-down    para a infraestrutura (mantém os volumes)"
	@echo "  infra-down-volumes  para e apaga os dados (postgres, redis, minio)"
	@echo "  infra-restart reinicia a infraestrutura"
	@echo ""
	@echo "Testes de integração (API):"
	@echo "  test-db-setup cria o banco gotardo_test e aplica migrations"
	@echo ""
	@echo "Produção on-prem (compose.prod.yaml — precisa de .env):"
	@echo "  prod-up       sobe a stack completa em produção (build + up)"
	@echo "  prod-up-local sobe a stack com TLS interno (teste sem DNS público)"
	@echo "  prod-build    constrói as imagens de produção"
	@echo "  prod-down     para a stack (mantém os volumes)"
	@echo "  prod-down-volumes  para e apaga os dados de produção"
	@echo "  prod-logs     acompanha os logs da stack"
	@echo "  prod-ps       status dos serviços de produção"
	@echo "  prod-backup   executa um backup manual (pg_dump → MinIO)"

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

format:
	pnpm format

py-install:
	uv venv --clear services/ml/.venv
	uv pip install --python services/ml/.venv/bin/python -e "services/ml[dev]"
	uv venv --clear services/ocr/.venv
	uv pip install --python services/ocr/.venv/bin/python -e "services/ocr[dev]"

py-test:
	services/ml/.venv/bin/pytest -q services/ml
	services/ocr/.venv/bin/pytest -q services/ocr

py-lint:
	services/ml/.venv/bin/ruff check services/ml
	services/ocr/.venv/bin/ruff check services/ocr

COMPOSE := docker compose -f compose.dev.yaml

infra-up:
	$(COMPOSE) up -d

infra-logs:
	$(COMPOSE) logs -f

infra-ps:
	$(COMPOSE) ps

infra-down:
	$(COMPOSE) down

infra-down-volumes:
	$(COMPOSE) down -v

infra-restart:
	$(COMPOSE) restart

TEST_DATABASE_URL ?= postgresql://gotardo:gotardo@localhost:5432/gotardo_test?schema=public

test-db-setup:
	docker exec gotardo-dev-postgres-1 psql -U gotardo -d gotardo -tc "SELECT 1 FROM pg_database WHERE datname='gotardo_test'" | grep -q 1 || docker exec gotardo-dev-postgres-1 createdb -U gotardo gotardo_test
	cd packages/db && DATABASE_URL="$(TEST_DATABASE_URL)" pnpm exec prisma migrate deploy

PROD_COMPOSE := docker compose -f compose.prod.yaml

prod-up:
	docker build -t gotardo-prod-api -f Dockerfile .
	docker tag gotardo-prod-api gotardo-prod-web
	docker build -t gotardo-prod-ml -f services/ml/Dockerfile services/ml
	docker build -t gotardo-prod-backup -f deploy/backup/Dockerfile deploy/backup
	$(PROD_COMPOSE) up -d --no-build

prod-up-local:
	docker build -t gotardo-prod-api -f Dockerfile .
	docker tag gotardo-prod-api gotardo-prod-web
	docker build -t gotardo-prod-ml -f services/ml/Dockerfile services/ml
	docker build -t gotardo-prod-backup -f deploy/backup/Dockerfile deploy/backup
	docker compose -f compose.prod.yaml -f compose.prod.local.yaml up -d --no-build

prod-build:
	docker build -t gotardo-prod-api -f Dockerfile .
	docker tag gotardo-prod-api gotardo-prod-web
	docker build -t gotardo-prod-ml -f services/ml/Dockerfile services/ml
	docker build -t gotardo-prod-backup -f deploy/backup/Dockerfile deploy/backup

prod-down:
	$(PROD_COMPOSE) down

prod-down-volumes:
	$(PROD_COMPOSE) down -v

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-ps:
	$(PROD_COMPOSE) ps

prod-backup:
	$(PROD_COMPOSE) run --rm backup /backup.sh --once