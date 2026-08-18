from fastapi import FastAPI

app = FastAPI(
    title="Gotardo OCR",
    description="Serviço de OCR da Gotardo Finanças — esqueleto inicial (P3)",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "gotardo-ocr", "version": "0.1.0"}
