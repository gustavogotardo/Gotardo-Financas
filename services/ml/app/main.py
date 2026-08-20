"""Serviço de ML da Gotardo Finanças — categorização automática de transações.

MVP por regras (português-BR) + aprendizado por família (precedência das
regras aprendidas). Persistência das regras aprendidas em JSON em `DATA_DIR`
(volume em produção, `/data`).
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .rules import detect_anomalies, normalize, suggest_with_rules

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
LEARNED_FILE = DATA_DIR / "learned.json"

app = FastAPI(
    title="Gotardo ML",
    description="Serviço de ML da Gotardo Finanças — categorização e anomalias",
    version="0.2.0",
)

_lock = threading.Lock()
_learned: dict[str, dict[str, str]] = {}


def _load() -> None:
    try:
        if LEARNED_FILE.exists():
            _learned.update(json.loads(LEARNED_FILE.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass


def _save() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        LEARNED_FILE.write_text(
            json.dumps(_learned, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        pass


_load()


class CategorizeRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    familyId: str | None = None
    amount: str | None = None


class CategorizeResponse(BaseModel):
    category: str | None
    confidence: float
    matched: str | None


class LearnRequest(BaseModel):
    familyId: str = Field(min_length=1)
    description: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=100)


class LearnResponse(BaseModel):
    ok: bool
    stored: int


class AnomalyItem(BaseModel):
    id: str
    description: str
    amount: str
    category: str | None = None


class AnomaliesRequest(BaseModel):
    transactions: list[AnomalyItem]


class AnomalyResult(BaseModel):
    id: str
    isAnomaly: bool
    reason: str | None = None


class AnomaliesResponse(BaseModel):
    anomalies: list[AnomalyResult]


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "gotardo-ml", "version": "0.2.0"}


@app.post("/categorize", response_model=CategorizeResponse)
def categorize(payload: CategorizeRequest) -> CategorizeResponse:
    learned = _learned.get(payload.familyId or "", {})
    category, confidence, matched = suggest_with_rules(payload.description, learned)
    return CategorizeResponse(category=category, confidence=confidence, matched=matched)


@app.post("/learn", response_model=LearnResponse)
def learn(payload: LearnRequest) -> LearnResponse:
    keyword = normalize(payload.description)
    with _lock:
        family_rules = _learned.setdefault(payload.familyId, {})
        family_rules[keyword] = payload.category
        stored = len(family_rules)
        _save()
    return LearnResponse(ok=True, stored=stored)


@app.post("/anomalies", response_model=AnomaliesResponse)
def anomalies(payload: AnomaliesRequest) -> AnomaliesResponse:
    items = [
        {"id": tx.id, "amount": float(tx.amount), "category": tx.category}
        for tx in payload.transactions
    ]
    flagged = detect_anomalies(items)
    return AnomaliesResponse(
        anomalies=[AnomalyResult(id=tx.id, **flagged[tx.id]) for tx in payload.transactions]
    )
