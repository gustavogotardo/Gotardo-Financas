from fastapi.testclient import TestClient

from app.main import _learned, _save, app

client = TestClient(app)


def _clean_learned() -> None:
    _learned.clear()


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_normalize_removes_accents_and_case() -> None:
    from app.rules import normalize

    assert normalize("PADARIA CENTRAL - TOMAZ COELHO") == "padaria central tomaz coelho"


def test_default_rule_padaria() -> None:
    response = client.post(
        "/categorize",
        json={"description": "PADARIA CENTRAL -18,50", "familyId": "f1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "Alimentação"
    assert body["confidence"] == 0.8


def test_default_rule_supermercado_sem_acento() -> None:
    response = client.post("/categorize", json={"description": "SUPERMERCADO EXTRA"})
    assert response.json()["category"] == "Alimentação"


def test_default_rule_salario() -> None:
    response = client.post("/categorize", json={"description": "Salário mensal"})
    assert response.json()["category"] == "Salário/Receitas"


def test_unknown_returns_null() -> None:
    response = client.post("/categorize", json={"description": "xyz abcde 12345"})
    body = response.json()
    assert body["category"] is None
    assert body["confidence"] == 0.0


def test_learn_overrides_default_rules_for_family() -> None:
    _clean_learned()
    learn = client.post(
        "/learn",
        json={"familyId": "f-1", "description": "SUPERMERCADO EXTRA", "category": "Compras"},
    )
    assert learn.status_code == 200
    assert learn.json()["ok"] is True

    # A regra aprendida da família tem precedência para a família f-1.
    response = client.post(
        "/categorize",
        json={"description": "SUPERMERCADO EXTRA", "familyId": "f-1"},
    )
    body = response.json()
    assert body["category"] == "Compras"
    assert body["confidence"] == 1.0

    # Outras famílias continuam usando as regras padrão.
    other = client.post(
        "/categorize",
        json={"description": "SUPERMERCADO EXTRA", "familyId": "f-2"},
    )
    assert other.json()["category"] == "Alimentação"


def test_learn_persists_to_file(tmp_path, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main_module, "LEARNED_FILE", tmp_path / "learned.json")
    _clean_learned()
    _save()
    assert (tmp_path / "learned.json").exists()
