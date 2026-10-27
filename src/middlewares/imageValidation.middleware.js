const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { sendError } = require('../utils/response');

/**
 * Validates image buffer magic numbers to prevent malicious file uploads
 * (e.g. executable/script files disguised with .jpg / .png extensions)
 */
const isValidImageMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 12) {
    return false;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // 3. WEBP: 'RIFF' .... 'WEBP'
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isRiff && isWebp) {
    return true;
  }

  return false;
};

const cleanupUploadedFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`[Upload Cleanup] Failed to delete invalid file ${filePath}:`, err.message);
    }
  }
};

/**
 * Middleware to strictly validate image file integrity, size, and prevent path traversal
 */
const validateImageUpload = (req, res, next) => {
  if (!req.file) {
    return sendError(res, 'No image file uploaded. Please provide an image under the "image" field.', [], 400);
  }

  const file = req.file;

  // 1. Path traversal check: Ensure file is stored strictly within configured upload directory
  const uploadDirResolved = path.resolve(process.cwd(), env.UPLOAD_DIR);
  const filePathResolved = path.resolve(file.path);
  if (!filePathResolved.startsWith(uploadDirResolved)) {
    cleanupUploadedFile(file.path);
    return sendError(res, 'Security violation: Invalid upload file path.', [], 400);
  }

  // 2. File size validation
  if (file.size > env.MAX_FILE_SIZE) {
    cleanupUploadedFile(file.path);
    return sendError(
      res,
      `File size exceeds configured limit of ${Math.round(env.MAX_FILE_SIZE / (1024 * 1024))}MB.`,
      [],
      413
    );
  }

  // 3. Inspect binary magic numbers of the file on disk
  try {
    const fd = fs.openSync(file.path, 'r');
    const headerBuffer = Buffer.alloc(16);
    fs.readSync(fd, headerBuffer, 0, 16, 0);
    fs.closeSync(fd);

    if (!isValidImageMagicBytes(headerBuffer)) {
      cleanupUploadedFile(file.path);
      return sendError(
        res,
        'Invalid image content. File signature does not match supported image formats (JPEG, PNG, WEBP).',
        [],
        400
      );
    }
  } catch (readErr) {
    cleanupUploadedFile(file.path);
    return sendError(res, `Failed to inspect image file: ${readErr.message}`, [], 400);
  }

  next();
};

module.exports = {
  validateImageUpload,
  isValidImageMagicBytes,
  cleanupUploadedFile,
};
