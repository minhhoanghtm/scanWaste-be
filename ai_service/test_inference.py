"""
Direct verification test for ScanWaste TFLite AI Inference
"""

import os
import io
import time
from PIL import Image
from inference import TFLiteInferenceEngine
from preprocessor import preprocess_image_bytes

def run_test():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(base_dir, "models", "scanwaste_mobilenetv2_v3.tflite")
    labels_path = os.path.join(base_dir, "models", "labels.txt")

    print(f"Testing inference engine with model: {model_path}")
    engine = TFLiteInferenceEngine(model_path=model_path, labels_path=labels_path)
    engine.load()

    # Create synthetic test image
    img = Image.new("RGB", (320, 240), color=(50, 150, 250))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    raw_bytes = buffer.getvalue()

    tensor = preprocess_image_bytes(raw_bytes)
    assert tensor.shape == (1, 224, 224, 3), f"Unexpected tensor shape: {tensor.shape}"

    start_time = time.perf_counter()
    result = engine.predict(tensor)
    duration = (time.perf_counter() - start_time) * 1000

    print(f"[OK] Real TFLite inference completed in {duration:.2f} ms")
    print(f"[OK] Predicted class: {result['predictedClass']}")
    print(f"[OK] Confidence: {result['confidence']}")
    print(f"[OK] Top predictions count: {len(result['topPredictions'])}")
    print(f"[OK] All classes: {[p['class'] for p in result['topPredictions']]}")
    
    # Verify probability distribution sum is approximately 1.0
    total_score = sum(p["score"] for p in result["topPredictions"])
    print(f"[OK] Sum of scores: {total_score:.4f}")
    assert 0.99 <= total_score <= 1.01, f"Invalid score sum: {total_score}"

    print("ALL AI INFERENCE ENGINE TESTS PASSED!")

if __name__ == "__main__":
    run_test()
