from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _build(amounts: list[float], category: str = "Alimentação", start: int = 0) -> list[dict]:
    return [
        {
            "id": f"tx-{start + index}",
            "description": f"Gasto {index}",
            "amount": str(amount),
            "category": category,
        }
        for index, amount in enumerate(amounts)
    ]


def _call(items: list[dict]) -> dict:
    response = client.post("/anomalies", json={"transactions": items})
    assert response.status_code == 200
    return {row["id"]: row for row in response.json()["anomalies"]}


def test_few_transactions_no_anomaly() -> None:
    items = _build([-10, -20])
    result = _call(items)
    assert all(not result[row]["isAnomaly"] for row in result)


def test_large_value_is_flagged() -> None:
    items = _build([-10, -15, -12, -5000])
    result = _call(items)
    assert result["tx-3"]["isAnomaly"] is True
    assert "mediana" in result["tx-3"]["reason"]
    assert not result["tx-0"]["isAnomaly"]
    assert not result["tx-2"]["isAnomaly"]


def test_income_is_never_flagged() -> None:
    items = [
        {"id": "exp-1", "description": "a", "amount": "-10", "category": "Alimentação"},
        {"id": "exp-2", "description": "b", "amount": "-12", "category": "Alimentação"},
        {"id": "exp-3", "description": "c", "amount": "-15", "category": "Alimentação"},
        {
            "id": "inc-1",
            "description": "salario",
            "amount": "100000",
            "category": "Salário/Receitas",
        },
    ]
    result = _call(items)
    assert not result["inc-1"]["isAnomaly"]


def test_category_median_prevents_false_positive() -> None:
    items = _build([-10, -12, -11, -13, -12, -8000], category="Alimentação")
    items += _build([-3000, -2800, -3200, -2900], category="Moradia", start=6)
    result = _call(items)
    # 8000 é ~680x a mediana da categoria Alimentação (~12).
    assert result["tx-5"]["isAnomaly"] is True
    # Gastos de moradia (~3000) são normais dentro da própria categoria,
    # mesmo sendo muito maiores que os de alimentação.
    assert not result["tx-6"]["isAnomaly"]
    assert not result["tx-9"]["isAnomaly"]
