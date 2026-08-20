"""Regras de categorização por palavras-chave (português-BR)."""

from __future__ import annotations

import re
import unicodedata

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
