const path = require('path');
const fs = require('fs');
const Classification = require('../classifications/classification.model');
const { SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI, WASTE_DISPOSAL_TIPS } = require('../ai/ai.config');
const env = require('../../config/env');

class HistoryService {
  /**
   * Get paginated classification history for a specific user with optional filters
   * @param {string} userId - User ID
   * @param {object} options - { page, limit, source, category, startDate, endDate }
   */
  async getUserHistory(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      source,
      category,
      startDate,
      endDate,
    } = options;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Filter strictly by user ID
    const query = { userId };

    // Optional source filter: 'server' | 'offline'
    if (source && ['server', 'offline'].includes(source.toLowerCase())) {
      query.classificationSource = source.toLowerCase();
    }

    // Optional category filter
    if (category && SUPPORTED_WASTE_CLASSES.includes(category.toLowerCase())) {
      query.predictedClass = category.toLowerCase();
    }

    // Optional date range filter based on classifiedAt
    if (startDate || endDate) {
      query.classifiedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          query.classifiedAt.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          query.classifiedAt.$lte = end;
        }
      }
      if (Object.keys(query.classifiedAt).length === 0) {
        delete query.classifiedAt;
      }
    }

    const [items, totalCount] = await Promise.all([
      Classification.find(query)
        .sort({ classifiedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Classification.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    // Enhance items with Vietnamese display names and disposal tips if missing
    const enrichedItems = items.map((doc) => {
      const obj = doc.toJSON();
      if (!obj.predictedClassVi) {
        obj.predictedClassVi = WASTE_CLASSES_VI[obj.predictedClass] || obj.predictedClass;
      }
      return obj;
    });

    return {
      items: enrichedItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    };
  }

  /**
   * Get single classification detail ensuring strict user ownership
   * @param {string} userId - Requesting user's ID
   * @param {string} id - Classification record ID
   * @param {string} userRole - User's role ('user' | 'admin')
   */
  async getHistoryDetail(userId, id, userRole = 'user') {
    const filter = userRole === 'admin' ? { _id: id } : { _id: id, userId };
    const classification = await Classification.findOne(filter);

    if (!classification) {
      const error = new Error('Classification record not found');
      error.statusCode = 404;
      throw error;
    }

    const detail = classification.toJSON();
    if (!detail.predictedClassVi) {
      detail.predictedClassVi = WASTE_CLASSES_VI[detail.predictedClass] || detail.predictedClass;
    }
    detail.disposalTips = WASTE_DISPOSAL_TIPS[detail.predictedClass] || [];

    return detail;
  }

  /**
   * Delete a classification record and remove its local image file if present
   * @param {string} userId - Requesting user's ID
   * @param {string} id - Classification record ID
   * @param {string} userRole - User's role ('user' | 'admin')
   */
  async deleteHistoryItem(userId, id, userRole = 'user') {
    const filter = userRole === 'admin' ? { _id: id } : { _id: id, userId };
    const classification = await Classification.findOne(filter);

    if (!classification) {
      const error = new Error('Classification record not found');
      error.statusCode = 404;
      throw error;
    }

    // Safely delete physical image file if uploaded to local storage
    if (classification.imageUrl && classification.imageUrl.startsWith('/uploads/')) {
      const relativeFileName = classification.imageUrl.replace(/^\/uploads\//, '');
      const uploadDirResolved = path.resolve(process.cwd(), env.UPLOAD_DIR);
      const fullPath = path.resolve(uploadDirResolved, relativeFileName);

      // Path traversal security check before unlinking
      if (fullPath.startsWith(uploadDirResolved) && fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          console.error(`[History Cleanup] Failed to delete file ${fullPath}: ${err.message}`);
        }
      }
    }

    await Classification.deleteOne({ _id: id });

    return {
      deleted: true,
      id,
      message: 'Classification record deleted successfully',
    };
  }
}

module.exports = new HistoryService();
