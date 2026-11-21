from fastapi import FastAPI

app = FastAPI(title="WodoPlon Python Service")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
