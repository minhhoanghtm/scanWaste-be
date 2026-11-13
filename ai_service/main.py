"""
ScanWaste AI Inference Microservice (FastAPI)
Exposes HTTP endpoints for TFLite MobileNetV2 V3 waste classification.
"""

import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from inference import TFLiteInferenceEngine
from preprocessor import preprocess_image_bytes


# Configure model paths (relative to workspace or configured via env)
DEFAULT_MODEL_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "scanwaste_mobilenetv2_v3.tflite")
)
DEFAULT_LABELS_PATH = os.getenv(
    "LABELS_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "labels.txt")
)
MODEL_VERSION = os.getenv("MODEL_VERSION", "v3")

engine: Optional[TFLiteInferenceEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = TFLiteInferenceEngine(
        model_path=DEFAULT_MODEL_PATH,
        labels_path=DEFAULT_LABELS_PATH,
        version=MODEL_VERSION,
    )
    engine.load()
    yield
    print("[AI Engine] Shutting down inference service...")


app = FastAPI(
    title="ScanWaste AI Inference Service",
    description="Dedicated microservice for TensorFlow Lite MobileNetV2 V3 inference",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PathPredictRequest(BaseModel):
    image_path: str


@app.get("/health", tags=["Health"])
async def health():
    ready = engine is not None and engine.is_ready()
    return {
        "status": "healthy" if ready else "initializing",
        "ready": ready,
        "model_version": MODEL_VERSION,
        "engine": "LiteRT/TFLite",
    }


@app.get("/model-info", tags=["Model"])
async def model_info():
    if not engine or not engine.is_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Inference Engine is not initialized",
        )
    return engine.get_info()


@app.post("/predict", tags=["Inference"])
async def predict_upload(file: UploadFile = File(...)):
    """
    Accepts multipart/form-data image file upload and returns MobileNetV2 V3 predictions.
    """
    if not engine or not engine.is_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Inference Engine is not available",
        )

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty image file uploaded",
            )
        tensor = preprocess_image_bytes(content)
        result = engine.predict(tensor)
        return {"success": True, "data": result}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image validation/preprocessing error: {str(ve)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(exc)}",
        )


@app.post("/predict-path", tags=["Inference"])
async def predict_path(payload: PathPredictRequest):
    """
    Fast local inter-process inference accepting a file path from Node.js backend.
    """
    if not engine or not engine.is_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Inference Engine is not available",
        )

    if not os.path.exists(payload.image_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image file not found at path: {payload.image_path}",
        )

    try:
        with open(payload.image_path, "rb") as f:
            content = f.read()
        tensor = preprocess_image_bytes(content)
        result = engine.predict(tensor)
        return {"success": True, "data": result}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image preprocessing error: {str(ve)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(exc)}",
        )


class ReloadModelRequest(BaseModel):
    model_path: str
    labels_path: Optional[str] = None
    model_version: Optional[str] = "v3"


@app.post("/reload-model", tags=["Model"])
async def reload_model(payload: ReloadModelRequest):
    """
    Dynamically loads and switches active TFLite inference model in-memory.
    Only swaps after successful allocation and warmup.
    """
    global engine, MODEL_VERSION
    target_path = os.path.abspath(payload.model_path)
    if not os.path.exists(target_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model artifact file not found at: {target_path}",
        )

    labels_path = payload.labels_path or DEFAULT_LABELS_PATH
    if labels_path and not os.path.isabs(labels_path):
        labels_path = os.path.abspath(labels_path)

    try:
        new_engine = TFLiteInferenceEngine(
            model_path=target_path,
            labels_path=labels_path,
            version=payload.model_version or "custom",
        )
        new_engine.load()
        # Atomically swap active engine after successful load & warmup
        engine = new_engine
        MODEL_VERSION = payload.model_version or "custom"
        return {
            "success": True,
            "message": f"Successfully reloaded active AI model to version {MODEL_VERSION}",
            "model_info": new_engine.get_info(),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to load new model artifact into inference engine: {str(exc)}",
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", "5005"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
