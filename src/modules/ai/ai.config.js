/**
 * AI Module Configuration
 * ScanWaste MobileNetV2 V3 TFLite Metadata & Waste Classes
 * 
 * Exact model output label order matching scanwaste_mobilenetv2_v3.tflite:
 * 0: organic
 * 1: cardboard
 * 2: glass
 * 3: metal
 * 4: paper
 * 5: plastic
 * 6: other
 */

const SUPPORTED_WASTE_CLASSES = [
  'organic',
  'cardboard',
  'glass',
  'metal',
  'paper',
  'plastic',
  'other',
];

const WASTE_CLASSES_VI = {
  organic: 'Rác hữu cơ',
  cardboard: 'Bìa carton',
  glass: 'Thủy tinh',
  metal: 'Kim loại',
  paper: 'Giấy',
  plastic: 'Nhựa',
  other: 'Rác khác',
};

const WASTE_DISPOSAL_TIPS = {
  organic: [
    'Phân loại vào thùng rác hữu cơ hoặc ủ làm phân compost',
    'Để ráo nước trước khi bỏ vào thùng để giảm mùi hôi',
  ],
  cardboard: [
    'Gấp dẹt thùng bìa carton để tiết kiệm diện tích chứa',
    'Giữ khô ráo và không để dính dầu mỡ thực phẩm',
  ],
  glass: [
    'Rửa sạch chai lọ thủy tinh trước khi bỏ vào thùng tái chế',
    'Nếu bị vỡ, bọc kỹ bằng giấy báo để tránh gây thương tích',
  ],
  metal: [
    'Rửa sạch cặn bẩn trong lon nước ngọt, hộp thiếc kim loại',
    'Bẹp lon kim loại để thu gọn thể tích trước khi tái chế',
  ],
  paper: [
    'Để riêng giấy sạch vào thùng rác tái chế giấy',
    'Tránh để giấy bị ướt hoặc dính dầu mỡ',
  ],
  plastic: [
    'Rửa sạch chai nhựa, cốc nhựa và tháo rời nắp chai',
    'Bóp dẹp vỏ chai để tối ưu không gian thùng chứa',
  ],
  other: [
    'Bỏ vào thùng rác vô cơ hoặc rác thải sinh hoạt thông thường',
    'Nếu là rác nguy hại (pin, bóng đèn), đưa đến điểm thu gom chuyên biệt',
  ],
};

const AI_CONFIG = {
  SUPPORTED_CLASSES: SUPPORTED_WASTE_CLASSES,
  DEFAULT_CLASS: 'other',
  CLASSES_VI: WASTE_CLASSES_VI,
  DISPOSAL_TIPS: WASTE_DISPOSAL_TIPS,
  ACTIVE_PROVIDER: process.env.AI_PROVIDER || 'fastapi_tflite',
  SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:5005',
  TIMEOUT_MS: parseInt(process.env.INFERENCE_TIMEOUT_MS, 10) || 5000,
  CURRENT_MODEL_VERSION: 'v3',
};

module.exports = {
  SUPPORTED_WASTE_CLASSES,
  WASTE_CLASSES_VI,
  WASTE_DISPOSAL_TIPS,
  AI_CONFIG,
};
