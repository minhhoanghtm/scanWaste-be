const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const { DatasetItem, DIFFICULTY_TAGS } = require('./dataset.model');
const { SUPPORTED_WASTE_CLASSES, WASTE_CLASSES_VI } = require('../ai/ai.config');
const env = require('../../config/env');

class DatasetService {
  /**
   * Upload and register a new dataset item with SHA-256 deduplication
   */
  async createDatasetItem(adminUserId, file, data = {}) {
    if (!file) {
      const error = new Error('No image file uploaded');
      error.statusCode = 400;
      throw error;
    }

    const {
      label,
      split = 'train',
      difficultyTag = 'standard',
      consentGiven = true,
      notes = '',
    } = data;

    // 1. Validate label
    if (!label || !SUPPORTED_WASTE_CLASSES.includes(label.toLowerCase())) {
      this._cleanupFile(file.path);
      const error = new Error(
        `Invalid label: "${label}". Must be one of: ${SUPPORTED_WASTE_CLASSES.join(', ')}`
      );
      error.statusCode = 400;
      throw error;
    }

    // 2. Validate split
    const normalizedSplit = split.toLowerCase();
    if (!['train', 'val', 'test'].includes(normalizedSplit)) {
      this._cleanupFile(file.path);
      const error = new Error('Invalid split. Must be one of: train, val, test');
      error.statusCode = 400;
      throw error;
    }

    // 3. Validate difficultyTag
    const normalizedDifficulty = difficultyTag.toLowerCase();
    if (!DIFFICULTY_TAGS.includes(normalizedDifficulty)) {
      this._cleanupFile(file.path);
      const error = new Error(`Invalid difficultyTag. Supported: ${DIFFICULTY_TAGS.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    // 4. Compute SHA-256 hash for deduplication
    let imageHash;
    try {
      const fileBuffer = fs.readFileSync(file.path);
      imageHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (readErr) {
      this._cleanupFile(file.path);
      const error = new Error(`Failed to read uploaded file: ${readErr.message}`);
      error.statusCode = 500;
      throw error;
    }

    // 5. Check if identical image already exists in dataset
    const existing = await DatasetItem.findOne({ imageHash });
    if (existing) {
      this._cleanupFile(file.path);
      const error = new Error(
        `Duplicate image detected. An identical image with SHA-256 hash (${imageHash.substring(0, 12)}...) already exists in the dataset (ID: ${existing._id}, split: ${existing.split}, label: ${existing.label}).`
      );
      error.statusCode = 409;
      throw error;
    }

    const imageUrl = `/uploads/${file.filename}`;
    const datasetItem = await DatasetItem.create({
      label: label.toLowerCase(),
      split: normalizedSplit,
      imageUrl,
      imageHash,
      source: 'manual_upload',
      difficultyTag: normalizedDifficulty,
      consentGiven: typeof consentGiven === 'string' ? consentGiven === 'true' : !!consentGiven,
      status: 'active',
      createdBy: adminUserId,
      metadata: {
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        notes: notes ? notes.trim() : '',
      },
    });

    return datasetItem;
  }

  /**
   * Paginated list of dataset items with advanced filtering & distribution statistics
   */
  async getDatasetList(query = {}) {
    const {
      page = 1,
      limit = 20,
      label,
      split,
      difficultyTag,
      source,
      consentGiven,
      status = 'active',
    } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status) filter.status = status;
    if (label && SUPPORTED_WASTE_CLASSES.includes(label.toLowerCase())) {
      filter.label = label.toLowerCase();
    }
    if (split && ['train', 'val', 'test'].includes(split.toLowerCase())) {
      filter.split = split.toLowerCase();
    }
    if (difficultyTag && DIFFICULTY_TAGS.includes(difficultyTag.toLowerCase())) {
      filter.difficultyTag = difficultyTag.toLowerCase();
    }
    if (source) filter.source = source;
    if (typeof consentGiven === 'string') {
      filter.consentGiven = consentGiven.toLowerCase() === 'true';
    }

    const [items, totalCount, distributionAgg] = await Promise.all([
      DatasetItem.find(filter)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      DatasetItem.countDocuments(filter),
      DatasetItem.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: { split: '$split', label: '$label' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build distribution breakdown for dataset health overview
    const distribution = {
      train: {},
      val: {},
      test: {},
    };
    for (const d of distributionAgg) {
      const { split: s, label: l } = d._id;
      if (distribution[s]) {
        distribution[s][l] = d.count;
      }
    }

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
      items,
      distribution,
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
   * Get single dataset item detail
   */
  async getDatasetItemDetail(id) {
    const item = await DatasetItem.findById(id)
      .populate('createdBy', 'name email')
      .populate('feedbackId');

    if (!item) {
      const error = new Error('Dataset item not found');
      error.statusCode = 404;
      throw error;
    }

    return item;
  }

  /**
   * Update dataset item metadata, label, split or status
   */
  async updateDatasetItem(id, updates = {}) {
    const item = await DatasetItem.findById(id);
    if (!item) {
      const error = new Error('Dataset item not found');
      error.statusCode = 404;
      throw error;
    }

    const { label, split, difficultyTag, status, notes } = updates;

    if (label) {
      if (!SUPPORTED_WASTE_CLASSES.includes(label.toLowerCase())) {
        const error = new Error(`Invalid label: "${label}"`);
        error.statusCode = 400;
        throw error;
      }
      item.label = label.toLowerCase();
    }

    if (split) {
      if (!['train', 'val', 'test'].includes(split.toLowerCase())) {
        const error = new Error(`Invalid split: "${split}"`);
        error.statusCode = 400;
        throw error;
      }
      item.split = split.toLowerCase();
    }

    if (difficultyTag) {
      if (!DIFFICULTY_TAGS.includes(difficultyTag.toLowerCase())) {
        const error = new Error(`Invalid difficultyTag: "${difficultyTag}"`);
        error.statusCode = 400;
        throw error;
      }
      item.difficultyTag = difficultyTag.toLowerCase();
    }

    if (status) {
      if (!['active', 'archived'].includes(status.toLowerCase())) {
        const error = new Error(`Invalid status: "${status}"`);
        error.statusCode = 400;
        throw error;
      }
      item.status = status.toLowerCase();
    }

    if (notes !== undefined) {
      item.metadata = { ...item.metadata, notes: String(notes).trim() };
    }

    await item.save();
    return item;
  }

  /**
   * Export dataset as a streaming ZIP file ready for Google Colab fine-tuning
   * Strictly includes ONLY items with consentGiven === true and status === 'active'
   * Strictly separates train, val, and test partitions to prevent data leakage
   */
  async streamExportZip(res, options = {}) {
    const filter = {
      status: 'active',
      consentGiven: true, // GDPR/privacy compliance: strictly require user consent
    };

    if (options.split && ['train', 'val', 'test'].includes(options.split.toLowerCase())) {
      filter.split = options.split.toLowerCase();
    }

    if (options.difficultyTag && DIFFICULTY_TAGS.includes(options.difficultyTag.toLowerCase())) {
      filter.difficultyTag = options.difficultyTag.toLowerCase();
    }

    const items = await DatasetItem.find(filter).sort({ split: 1, label: 1 });

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `scanwaste_dataset_${options.split || 'full'}_${dateStr}.zip`;

    res.attachment(zipFilename);
    res.setHeader('Content-Type', 'application/zip');

    const archive =
      typeof archiver === 'function'
        ? archiver('zip', { zlib: { level: 6 } })
        : new archiver.ZipArchive({ zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('[Dataset Export Error]', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Archive generation error' });
      }
    });

    archive.pipe(res);

    // 1. Add classes.txt in exact MobileNetV2 V3 output order
    const classesContent = SUPPORTED_WASTE_CLASSES.join('\n');
    archive.append(classesContent, { name: 'dataset/classes.txt' });

    // 2. Prepare summary statistics for metadata.json
    const summary = {
      exportTimestamp: new Date().toISOString(),
      targetArchitecture: 'MobileNetV2 V4/V5',
      totalImagesExported: 0,
      classes: SUPPORTED_WASTE_CLASSES,
      splits: { train: 0, val: 0, test: 0 },
      classCounts: {},
      difficultyTagCounts: {},
    };

    for (const c of SUPPORTED_WASTE_CLASSES) {
      summary.classCounts[c] = 0;
    }
    for (const dt of DIFFICULTY_TAGS) {
      summary.difficultyTagCounts[dt] = 0;
    }

    const uploadDirResolved = path.resolve(process.cwd(), env.UPLOAD_DIR);

    // 3. Add image files partitioned strictly by split and label
    for (const item of items) {
      if (!item.imageUrl) continue;

      const relativeFileName = item.imageUrl.replace(/^\/uploads\//, '');
      const fullPath = path.resolve(uploadDirResolved, relativeFileName);

      // Path traversal security check
      if (!fullPath.startsWith(uploadDirResolved)) {
        continue;
      }

      if (fs.existsSync(fullPath)) {
        const ext = path.extname(fullPath) || '.jpg';
        const safeName = `${item.imageHash.substring(0, 16)}_${path.basename(fullPath)}`;
        const zipEntryPath = `dataset/${item.split}/${item.label}/${safeName}`;

        archive.file(fullPath, { name: zipEntryPath });

        summary.totalImagesExported++;
        summary.splits[item.split] = (summary.splits[item.split] || 0) + 1;
        summary.classCounts[item.label] = (summary.classCounts[item.label] || 0) + 1;
        summary.difficultyTagCounts[item.difficultyTag] =
          (summary.difficultyTagCounts[item.difficultyTag] || 0) + 1;
      }
    }

    // 4. Add metadata.json to root of ZIP
    archive.append(JSON.stringify(summary, null, 2), { name: 'dataset/metadata.json' });

    // 5. Finalize archive
    await archive.finalize();
  }

  _cleanupFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`[Dataset File Cleanup] Could not delete ${filePath}: ${err.message}`);
      }
    }
  }
}

module.exports = new DatasetService();
