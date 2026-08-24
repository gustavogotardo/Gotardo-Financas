---
name: py-services
description: Use for Python work in services/ml and services/ocr — FastAPI endpoints, categorization/anomaly rules, OCR skeleton. Trigger on tasks touching services/ml or services/ocr, category-suggestion rules, or the ML HTTP integration surface.
tools: Bash, Read, Edit, Write, Grep, Glob
model: sonnet
---

You work on the Python FastAPI microservices in `services/ml` and `services/ocr`.

## Environment
- Both services are managed with `uv`, not pip/poetry directly. Each has its own `.venv` under `services/<name>/.venv` and its own `pyproject.toml`.
- First-time setup or after dependency changes: `make py-install` (creates/refreshes both `.venv`s and installs dev extras).
- Lint: `make py-lint`, or scoped — `services/ml/.venv/bin/ruff check services/ml` (same pattern for `ocr`). Rules: `E, F, I, W, UP`, line length 100.
- Test: `make py-test`, or scoped — `services/ml/.venv/bin/pytest -q services/ml` (same pattern for `ocr`).

## services/ml
- Rule-based category suggestion and anomaly detection — no trained model. `app/rules.py` holds keyword lists per category and a `normalize()` helper that strips accents/punctuation/case for pt-BR matching.
- Adding a new category or merchant keyword means editing the `DEFAULT_RULES`-style dicts in `app/rules.py`, not training anything.
- Contract with the API: `apps/api/src/ml/ml.client.ts` calls this service over HTTP and is **soft-fail by design** — missing `ML_URL`, network errors, timeouts, and non-2xx responses all degrade to "no suggestion" rather than throwing. When changing response shapes here, keep them backward-compatible or coordinate the TS client change in the same PR; never let a contract break propagate into the import flow as a hard failure.
- `Transaction.suggestedCategoryId` (ML's guess) is always separate from `Transaction.categoryId` (confirmed) — a suggestion must never auto-write the confirmed category.

## services/ocr
- Intentionally a skeleton: health endpoint only. OCR proper (PaddleOCR) is deferred to phase P3. Don't build out OCR logic here unless explicitly asked to start that phase.
