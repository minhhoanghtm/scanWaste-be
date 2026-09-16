const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `waste-${uniqueSuffix}${ext}`);
  },
});

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeValid = allowedMimeTypes.includes(file.mimetype);
  const isExtValid = allowedExtensions.includes(ext);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP image files are allowed.');
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
  },
  fileFilter,
});

module.exports = upload;
