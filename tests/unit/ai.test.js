/**
 * Unit tests for isolated business logic / services
 */
const { AIAdapterFactory } = require('../../src/modules/ai/ai.adapter');
const { SUPPORTED_WASTE_CLASSES } = require('../../src/modules/ai/ai.config');

const runUnitTests = async () => {
  console.log('Running AI Module Unit Tests...');
  const adapter = AIAdapterFactory.getAdapter('mock');
  const result = await adapter.predict('test_plastic.jpg');
  
  if (result.predictedClass === 'plastic' && result.confidence === 0 && result.details.mock === true) {
    console.log('✔ AI Mock Adapter unit test passed');
  } else {
    console.error('✖ AI Mock Adapter unit test failed');
    process.exit(1);
  }
};

if (require.main === module) {
  runUnitTests();
}

module.exports = runUnitTests;
