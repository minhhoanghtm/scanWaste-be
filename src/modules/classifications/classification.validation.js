const { sendError } = require('../../utils/response');

const validateClassificationUpload = (req, res, next) => {
  if (!req.file) {
    return sendError(res, 'Please upload an image file using the "image" field', ['Image file is required'], 400);
  }
  next();
};

module.exports = {
  validateClassificationUpload,
};
