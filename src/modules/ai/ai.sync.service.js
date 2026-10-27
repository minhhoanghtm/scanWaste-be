const Classification = require('../classifications/classification.model');
const { SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI, WASTE_DISPOSAL_TIPS } = require('./ai.config');

class AISyncService {
  /**
   * Synchronize single offline classification record with concurrency-safe idempotency
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {object} itemData
   * @returns {Promise<object>}
   */
  async syncSingleItem(userId, itemData) {
    const {
      clientClassificationId,
      predictedClass,
      predictedClassVi,
      confidence,
      scores,
      modelVersion = 'v3',
      inferenceTimeMs = 0,
      classifiedAt,
      imageUrl = null,
      metadata = {},
    } = itemData;

    // 1. Validate required clientClassificationId
    if (!clientClassificationId || typeof clientClassificationId !== 'string' || !clientClassificationId.trim()) {
      const error = new Error('clientClassificationId is required and must be a non-empty string');
      error.statusCode = 400;
      throw error;
    }

    const trimmedClientId = clientClassificationId.trim();

    // 2. Validate predictedClass
    if (!predictedClass || !SUPPORTED_WASTE_CLASSES.includes(predictedClass.toLowerCase())) {
      const error = new Error(`Invalid predictedClass: "${predictedClass}". Must be one of: ${SUPPORTED_WASTE_CLASSES.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const normalizedClass = predictedClass.toLowerCase();
    const finalClassVi = predictedClassVi || WASTE_CLASSES_VI[normalizedClass] || normalizedClass;
    const finalConfidence = typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0;
    const parsedClassifiedAt = classifiedAt ? new Date(classifiedAt) : new Date();
    const finalClassifiedAt = isNaN(parsedClassifiedAt.getTime()) ? new Date() : parsedClassifiedAt;

    // 3. Fast pre-check for existing record (Idempotency)
    const existing = await Classification.findOne({
      userId,
      clientClassificationId: trimmedClientId,
    });

    if (existing) {
      return {
        id: existing._id,
        classificationId: existing._id.toString(),
        clientClassificationId: existing.clientClassificationId,
        predictedClass: existing.predictedClass,
        predictedClassVi: existing.predictedClassVi,
        confidence: existing.confidence,
        scores: existing.scores,
        modelVersion: existing.modelVersion,
        inferenceTimeMs: existing.inferenceTimeMs,
        classificationSource: existing.classificationSource,
        classifiedAt: existing.classifiedAt,
        imageUrl: existing.imageUrl,
        isDuplicate: true,
        message: 'Record was already synchronized previously',
      };
    }

    // 4. Concurrency-safe Insertion
    try {
      const newClassification = await Classification.create({
        userId,
        imageUrl: imageUrl || null,
        predictedClass: normalizedClass,
        predictedClassVi: finalClassVi,
        confidence: finalConfidence,
        scores: scores || {},
        modelVersion: modelVersion || 'v3',
        inferenceTimeMs: typeof inferenceTimeMs === 'number' ? inferenceTimeMs : 0,
        classificationSource: 'offline', // Strictly marked as client offline
        clientClassificationId: trimmedClientId,
        classifiedAt: finalClassifiedAt,
        metadata: {
          ...metadata,
          disposalTips: WASTE_DISPOSAL_TIPS[normalizedClass] || [],
          syncedAt: new Date(),
          verifiedByServer: false, // Explicitly marks that server did not infer this
        },
      });

      return {
        id: newClassification._id,
        classificationId: newClassification._id.toString(),
        clientClassificationId: newClassification.clientClassificationId,
        predictedClass: newClassification.predictedClass,
        predictedClassVi: newClassification.predictedClassVi,
        confidence: newClassification.confidence,
        scores: newClassification.scores,
        modelVersion: newClassification.modelVersion,
        inferenceTimeMs: newClassification.inferenceTimeMs,
        classificationSource: newClassification.classificationSource,
        classifiedAt: newClassification.classifiedAt,
        imageUrl: newClassification.imageUrl,
        isDuplicate: false,
        message: 'Offline classification synchronized successfully',
      };
    } catch (err) {
      // Handle race condition: if concurrent request inserted the exact same clientClassificationId
      if (err.code === 11000) {
        const winningDoc = await Classification.findOne({
          userId,
          clientClassificationId: trimmedClientId,
        });

        if (winningDoc) {
          return {
            id: winningDoc._id,
            classificationId: winningDoc._id.toString(),
            clientClassificationId: winningDoc.clientClassificationId,
            predictedClass: winningDoc.predictedClass,
            predictedClassVi: winningDoc.predictedClassVi,
            confidence: winningDoc.confidence,
            scores: winningDoc.scores,
            modelVersion: winningDoc.modelVersion,
            inferenceTimeMs: winningDoc.inferenceTimeMs,
            classificationSource: winningDoc.classificationSource,
            classifiedAt: winningDoc.classifiedAt,
            imageUrl: winningDoc.imageUrl,
            isDuplicate: true,
            message: 'Record synchronized concurrently',
          };
        }
      }
      throw err;
    }
  }

  /**
   * Synchronize batch or single payload
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {object|array} payload
   */
  async syncOfflineData(userId, payload) {
    if (!payload) {
      const error = new Error('No sync payload provided');
      error.statusCode = 400;
      throw error;
    }

    // Determine if payload is batch (array or { items: [...] })
    const isArray = Array.isArray(payload);
    const isItemsObject = payload && Array.isArray(payload.items);

    if (isArray || isItemsObject) {
      const items = isArray ? payload : payload.items;
      if (items.length === 0) {
        return {
          syncedCount: 0,
          duplicateCount: 0,
          items: [],
        };
      }

      // Limit batch size to protect server resources
      if (items.length > 100) {
        const error = new Error('Batch sync limit exceeded. Maximum 100 items per request.');
        error.statusCode = 400;
        throw error;
      }

      const results = [];
      let syncedCount = 0;
      let duplicateCount = 0;

      for (const item of items) {
        try {
          const res = await this.syncSingleItem(userId, item);
          if (res.isDuplicate) {
            duplicateCount++;
          } else {
            syncedCount++;
          }
          results.push(res);
        } catch (itemErr) {
          results.push({
            clientClassificationId: item.clientClassificationId || null,
            error: itemErr.message,
            success: false,
          });
        }
      }

      return {
        syncedCount,
        duplicateCount,
        totalProcessed: items.length,
        items: results,
      };
    }

    // Single item payload
    return await this.syncSingleItem(userId, payload);
  }
}

module.exports = new AISyncService();
