PY := uv run
PATH := $(HOME)/.local/bin:$(PATH)
export PATH

.PHONY: help install test lint typecheck build format dev py-install py-test py-lint

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