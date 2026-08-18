from fastapi import FastAPI

app = FastAPI(
    title="Gotardo ML",
    description="Serviço de ML da Gotardo Finanças — categorização e anomalias",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "gotardo-ml", "version": "0.1.0"}
