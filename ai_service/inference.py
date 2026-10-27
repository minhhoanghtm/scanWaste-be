"""
ScanWaste AI Inference Engine
Executes real TensorFlow Lite inference using Google ai-edge-litert runtime.
Loads model once at startup, keeps model warm in memory, and provides thread-safe prediction.
"""

import os
import time
import threading
from typing import Dict, Any, List
import numpy as np
try:
    import ai_edge_litert.interpreter as litert
except ImportError:
    try:
        import tflite_runtime.interpreter as litert
    except ImportError:
        import tensorflow.lite as litert



DEFAULT_LABELS = [
    "organic",
    "cardboard",
    "glass",
    "metal",
    "paper",
    "plastic",
    "other",
]


class TFLiteInferenceEngine:
    def __init__(self, model_path: str, labels_path: str = None, version: str = "v3"):
        self.model_path = model_path
        self.labels_path = labels_path
        self.version = version
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.labels: List[str] = DEFAULT_LABELS
        self._lock = threading.Lock()
        self.loaded_at = None

    def load(self):
        """Load TFLite model and allocate tensors once into memory."""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"TFLite model file not found at: {self.model_path}")

        # Load labels if available
        if self.labels_path and os.path.exists(self.labels_path):
            with open(self.labels_path, "r", encoding="utf-8") as f:
                loaded = [line.strip() for line in f if line.strip()]
                if len(loaded) == 7:
                    self.labels = loaded

        print(f"[AI Engine] Loading model from {self.model_path} ...")
        self.interpreter = litert.Interpreter(model_path=self.model_path)
        self.interpreter.allocate_tensors()

        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        # Warm up the interpreter with a zero tensor
        dummy = np.zeros(self.input_details[0]["shape"], dtype=np.float32)
        with self._lock:
            self.interpreter.set_tensor(self.input_details[0]["index"], dummy)
            self.interpreter.invoke()

        self.loaded_at = time.time()
        print(f"[AI Engine] Model loaded & warmed up successfully. Input shape: {self.input_details[0]['shape']}, Classes: {self.labels}")

    def is_ready(self) -> bool:
        return self.interpreter is not None

    def get_info(self) -> Dict[str, Any]:
        return {
            "model_version": self.version,
            "model_path": self.model_path,
            "input_shape": self.input_details[0]["shape"].tolist() if self.input_details else None,
            "input_dtype": str(self.input_details[0]["dtype"]) if self.input_details else None,
            "output_shape": self.output_details[0]["shape"].tolist() if self.output_details else None,
            "labels": self.labels,
            "ready": self.is_ready(),
            "loaded_at": self.loaded_at,
        }

    def predict(self, input_tensor: np.ndarray) -> Dict[str, Any]:
        """
        Run inference on preprocessed tensor [1, 224, 224, 3].
        Thread-safe execution.
        """
        if not self.is_ready():
            raise RuntimeError("AI model has not been initialized or loaded.")

        start_time = time.perf_counter()

        with self._lock:
            self.interpreter.set_tensor(self.input_details[0]["index"], input_tensor)
            self.interpreter.invoke()
            raw_output = self.interpreter.get_tensor(self.output_details[0]["index"])[0]

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Raw output is softmax probabilities from MobileNetV2 V3 output layer
        scores = [float(val) for val in raw_output]

        # Pair each label with its probability score
        predictions = []
        scores_map = {}
        for idx, label in enumerate(self.labels):
            score = scores[idx] if idx < len(scores) else 0.0
            scores_map[label] = round(score, 4)
            predictions.append({"class": label, "score": round(score, 4)})

        # Sort descending by score
        predictions.sort(key=lambda x: x["score"], reverse=True)
        top_pred = predictions[0]

        return {
            "predictedClass": top_pred["class"],
            "confidence": top_pred["score"],
            "topPredictions": predictions,
            "scores": scores_map,
            "modelVersion": self.version,
            "inferenceTimeMs": duration_ms,
            "source": "server",
        }
