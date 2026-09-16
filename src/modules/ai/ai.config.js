/**
 * AI Module Configuration
 * Supported Waste Categories and Model settings
 */

const SUPPORTED_WASTE_CLASSES = [
  'plastic',
  'paper',
  'glass',
  'metal',
  'organic',
  'cardboard',
  'other',
];

const AI_CONFIG = {
  SUPPORTED_CLASSES: SUPPORTED_WASTE_CLASSES,
  DEFAULT_CLASS: 'other',
  // Active provider: 'mock' | 'onnx' | 'tensorflow' | 'external_api'
  ACTIVE_PROVIDER: process.env.AI_PROVIDER || 'mock',
};

module.exports = {
  SUPPORTED_WASTE_CLASSES,
  AI_CONFIG,
};
