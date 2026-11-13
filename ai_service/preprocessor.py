"""
ScanWaste AI Preprocessor
Preprocesses raw image bytes to match MobileNetV2 V3 TFLite model specifications:
- Input shape: [1, 224, 224, 3]
- Data type: Float32
- Color format: RGB
- Value range: [0, 255] (normalization is handled inside the model)
"""

import io
from PIL import Image, ImageOps
import numpy as np


TARGET_SIZE = (224, 224)


def preprocess_image_bytes(image_bytes: bytes) -> np.ndarray:
    """
    Preprocess image bytes into a numpy array ready for MobileNetV2 V3 TFLite inference.

    Args:
        image_bytes: Raw bytes of the image (JPEG, PNG, WEBP, etc.)

    Returns:
        np.ndarray: Batch tensor of shape (1, 224, 224, 3) and dtype float32
    """
    if not image_bytes:
        raise ValueError("Image bytes cannot be empty")

    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as exc:
        raise ValueError(f"Failed to decode image bytes: {str(exc)}") from exc

    # 1. Automatically handle EXIF orientation from mobile phone cameras
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        # If EXIF reading fails or is missing, proceed with image as-is
        pass

    # 2. Ensure 3-channel RGB format (converts RGBA, Grayscale, CMYK, etc.)
    if image.mode != "RGB":
        image = image.convert("RGB")

    # 3. Resize to 224x224 using Bilinear interpolation matching training setup
    image_resized = image.resize(TARGET_SIZE, Image.Resampling.BILINEAR)

    # 4. Convert to float32 NumPy array with values in [0, 255]
    img_array = np.array(image_resized, dtype=np.float32)

    # 5. Add batch dimension: [1, 224, 224, 3]
    tensor = np.expand_dims(img_array, axis=0)

    return tensor
