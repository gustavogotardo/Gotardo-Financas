---
name: py-service-check
description: Install, lint, and test the Python FastAPI microservices in services/ml and services/ocr (uv-managed venvs, ruff, pytest). Use whenever Python code under services/ has changed and needs validation, or when a fresh checkout needs its Python venvs set up.
---

# Python service checks (services/ml, services/ocr)

Prereqs: Python >= 3.11 and `uv` installed. The Makefile prepends `$(HOME)/.local/bin`
to `PATH` for `uv` — make sure `uv` is on that path or already available in the shell.

## Setup (first time, or when deps change)
```
make py-install
```
Creates (or `--clear`-recreates) `.venv` under both `services/ml` and `services/ocr`,
installing each package with its `[dev]` extras via `uv pip install -e`.

## Lint
```
make py-lint
```
Scoped to one service:
```
services/ml/.venv/bin/ruff check services/ml
services/ocr/.venv/bin/ruff check services/ocr
```
Rule set: `E, F, I, W, UP`, line length 100.

## Test
```
make py-test
```
Scoped to one service:
```
services/ml/.venv/bin/pytest -q services/ml
services/ocr/.venv/bin/pytest -q services/ocr
```
Tests live in `services/<name>/tests`.

## Context to keep in mind
- `services/ocr` is a deferred (P3) skeleton — expect only a health endpoint and
  minimal tests. A small surface area there is expected; don't build out OCR logic
  unless explicitly asked to start that phase.
- `services/ml`'s real logic is rule-based categorization/anomaly detection
  (`app/rules.py`) — its tests mostly cover keyword-matching and text normalization,
  not ML model behavior.
