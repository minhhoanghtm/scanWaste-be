
const path = require('path');
const fs = require('fs');

const Classification = require('../classifications/classification.model');

const {
  SUPPORTED_WASTE_CLASSES,
  WASTE_CLASSES_VI,
  WASTE_DISPOSAL_TIPS,
} = require('../ai/ai.config');

const env = require('../../config/env');

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// UC010: Parse and validate date filters
function parseDate(value, endOfDay = false) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw createError('Date must be a string', 400);
  }

  let date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const time = endOfDay
      ? '23:59:59.999'
      : '00:00:00.000';

    date = new Date(`${value}T${time}Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw createError('Invalid date', 400);
    }
  } else {
    date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw createError('Invalid date', 400);
    }
  }

  return date;
}

class HistoryService {
  // UC010: Get paginated and filtered classification history
  async getUserHistory(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      source,
      category,
      startDate,
      endDate,
      from,
      to,
    } = options;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(
      1,
      Math.min(100, parseInt(limit, 10) || 10)
    );

    const skip = (pageNum - 1) * limitNum;
    const query = { userId };

    // Keep existing source filter
    if (source) {
      if (!['server', 'offline'].includes(String(source).toLowerCase())) {
        throw createError('Invalid classification source', 400);
      }

      query.classificationSource = String(source).toLowerCase();
    }

    // Keep existing category filter
    if (category) {
      const normalizedCategory = String(category).toLowerCase();

      if (!SUPPORTED_WASTE_CLASSES.includes(normalizedCategory)) {
        throw createError('Invalid waste category', 400);
      }

      query.predictedClass = normalizedCategory;
    }

    // Support both develop parameters and UC010 parameters
    const effectiveStartDate = startDate || from;
    const effectiveEndDate = endDate || to;

    const fromDate = parseDate(effectiveStartDate);
    const toDate = parseDate(effectiveEndDate, true);

    if (fromDate && toDate && fromDate > toDate) {
      throw createError(
        '"from" must not be later than "to"',
        400
      );
    }

    // Use classifiedAt to remain compatible with develop
    if (fromDate || toDate) {
      query.classifiedAt = {};

      if (fromDate) {
        query.classifiedAt.$gte = fromDate;
      }

      if (toDate) {
        query.classifiedAt.$lte = toDate;
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

    // Enrich history items with Vietnamese names and points
    const enrichedItems = items.map((doc) => {
      const result = doc.toJSON();

      if (!result.predictedClassVi) {
        result.predictedClassVi =
          WASTE_CLASSES_VI[result.predictedClass] ||
          result.predictedClass;
      }

      result.pointsEarned = doc.pointsEarned ?? 0;

      return result;
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
      filters: {
        from: effectiveStartDate || null,
        to: effectiveEndDate || null,
        source: source || null,
        category: category || null,
      },
    };
  }

  // Get classification detail while checking ownership
  async getHistoryDetail(userId, id, userRole = 'user') {
    const filter =
      userRole === 'admin'
        ? { _id: id }
        : { _id: id, userId };

    const classification = await Classification.findOne(filter);

    if (!classification) {
      throw createError('Classification record not found', 404);
    }

    const detail = classification.toJSON();

    if (!detail.predictedClassVi) {
      detail.predictedClassVi =
        WASTE_CLASSES_VI[detail.predictedClass] ||
        detail.predictedClass;
    }

    detail.disposalTips =
      WASTE_DISPOSAL_TIPS[detail.predictedClass] || [];

    detail.pointsEarned = classification.pointsEarned ?? 0;

    return detail;
  }

  // Delete history record and its local uploaded image
  async deleteHistoryItem(userId, id, userRole = 'user') {
    const filter =
      userRole === 'admin'
        ? { _id: id }
        : { _id: id, userId };

    const classification = await Classification.findOne(filter);

    if (!classification) {
      throw createError('Classification record not found', 404);
    }

    if (
      classification.imageUrl &&
      classification.imageUrl.startsWith('/uploads/')
    ) {
      const relativeFileName = classification.imageUrl.slice(
        '/uploads/'.length
      );

      const uploadDirResolved = path.resolve(
        process.cwd(),
        env.UPLOAD_DIR
      );

      const fullPath = path.resolve(
        uploadDirResolved,
        relativeFileName
      );

      // Prevent path traversal outside upload directory
      const relativePath = path.relative(
        uploadDirResolved,
        fullPath
      );

      const isInsideUploadDir =
        relativePath !== '' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        relativePath !== '..' &&
        !path.isAbsolute(relativePath);

      if (isInsideUploadDir && fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (error) {
          console.error(
            `[History Cleanup] Failed to delete image: ${error.message}`
          );
        }
      }
    }

    await Classification.deleteOne({ _id: id });

    return {
      deleted: true,
      id,
      message: 'Classification history deleted successfully',
    };
  }
}

module.exports = new HistoryService();
