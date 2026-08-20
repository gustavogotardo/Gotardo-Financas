"""Regras de categorização por palavras-chave (português-BR)."""

from __future__ import annotations

import re
import statistics
import unicodedata
from collections import defaultdict

_PUNCT_RE = re.compile(r"[^\w\s]+")
_WS_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Minúsculas, sem acentos, sem pontuação e com espaços colapsados."""
    lowered = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    lowered = lowered.lower()
    return _WS_RE.sub(" ", _PUNCT_RE.sub(" ", lowered)).strip()


DEFAULT_RULES: dict[str, tuple[str, ...]] = {
    "Alimentação": (
        "padaria",
        "supermercado",
        "mercado",
        "hipermercado",
        "feira",
        "hortifruti",
        "acougue",
        "restaurante",
        "lanchonete",
        "delivery",
        "ifood",
        "uber eats",
        "rappi",
        "marmita",
        "salgado",
        "conveniencia",
        "mercearia",
        "suco",
        "cafe",
    ),
    "Transporte": (
        "posto",
        "combustivel",
        "gasolina",
        "etanol",
        "diesel",
        "uber",
        "taxi",
        "99pop",
        "estacionamento",
        "pedagio",
    ),
    "Moradia": (
        "aluguel",
        "condominio",
        "conta de agua",
        "conta de luz",
        "energia eletrica",
        "iptu",
        "ipva",
        "agua",
        "luz",
        "gas",
        "manutencao",
        "reforma",
        "pintura",
    ),
    "Saúde": (
        "farmacia",
        "drogaria",
        "medico",
        "consulta",
        "dentista",
        "clinica",
        "plano de saude",
        "hospital",
        "exame",
        "academia",
        "fisioterapia",
    ),
    "Educação": (
        "escola",
        "faculdade",
        "universidade",
        "curso",
        "matricula",
        "mensalidade",
        "livraria",
        "idiomas",
        "cursinho",
    ),
    "Lazer": (
        "cinema",
        "show",
        "teatro",
        "viagem",
        "hotel",
        "pousada",
        "ingresso",
        "parque",
        "netflix",
        "spotify",
        "streaming",
        "jogos",
        "passeio",
    ),
    "Vestuário": (
        "roupa",
        "calca",
        "camiseta",
        "sapato",
        "tenis",
        "moda",
        "boutique",
        "vestuario",
    ),
    "Salário/Receitas": (
        "salario",
        "holerite",
        "admissao",
        "decimo",
        "ferias",
        "bonus",
        "comissao",
        "freelance",
        "reembolso",
        "venda",
        "rendimento",
        "juros",
        "dividendo",
        "pix recebido",
    ),
}


def suggest_with_rules(
    description: str, learned: dict[str, str]
) -> tuple[str | None, float, str | None]:
    """Retorna (categoria, confiança, regra que casou) para uma descrição.

    Aprendizado da família tem precedência sobre as regras padrão.
    """
    normalized = normalize(description)
    if not normalized:
        return None, 0.0, None

    for keyword, category in learned.items():
        if keyword in normalized:
            return category, 1.0, keyword

    for category, keywords in DEFAULT_RULES.items():
        for keyword in keywords:
            if keyword in normalized:
                return category, 0.8, keyword

    return None, 0.0, None


ANOMALY_FACTOR = 5.0
MIN_ANOMALY_VALUE = 100.0
MIN_SAMPLES = 3


def detect_anomalies(items: list[dict]) -> dict[str, dict]:
    """Identifica despesas anômalas dentro de uma lista de transações.

    `items` é uma lista de dicionários com `id`, `amount` (negativo p/ despesa)
    e `category` (opcional). Usa a mediana por categoria (fallback: mediana
    global); uma despesa é anômala quando |valor| >= 5x a mediana do grupo e
    >= `MIN_ANOMALY_VALUE`. Com menos de 3 despesas não há estatística
    suficiente e nada é sinalizado.
    """
    result: dict[str, dict] = {item["id"]: {"isAnomaly": False, "reason": None} for item in items}
    expenses = [item for item in items if float(item["amount"]) < 0]
    if len(expenses) < MIN_SAMPLES:
        return result

    groups: dict[str, list[dict]] = defaultdict(list)
    for item in expenses:
        groups[item.get("category") or ""].append(item)

    global_median = statistics.median(abs(float(item["amount"])) for item in expenses)

    for group in groups.values():
        median = (
            statistics.median(abs(float(item["amount"])) for item in group)
            if len(group) >= MIN_SAMPLES
            else global_median
        )
        if median <= 0:
            continue
        threshold = max(median * ANOMALY_FACTOR, MIN_ANOMALY_VALUE)
        for item in group:
            value = abs(float(item["amount"]))
            if value >= threshold and value >= MIN_ANOMALY_VALUE:
                result[item["id"]] = {
                    "isAnomaly": True,
                    "reason": (
                        f"Valor {value:.2f} é {value / median:.1f}x a mediana "
                        f"do grupo ({median:.2f})"
                    ),
                }
    return result
