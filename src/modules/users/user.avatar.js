const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const env = require('../../config/env');
const User = require('./user.model');
const userService = require('./user.service');
const { isValidImageMagicBytes } = require('../../middlewares/imageValidation.middleware');

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE, files: 1, fields: 0 },
  fileFilter(req, file, done) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    done(allowed.includes(file.mimetype) ? null
      : Object.assign(new Error('Avatar must be JPEG, PNG, or WEBP'), { statusCode: 400 }), true);
  },
}).single('avatar');

const directory = () => path.resolve(process.cwd(), env.UPLOAD_DIR, 'avatars');
async function removeFile(url) {
  // Never remove classification uploads, external URLs, or a path outside avatars.
  if (typeof url !== 'string' || !/^\/uploads\/avatars\/[a-f0-9-]+\.(png|jpg|webp)$/.test(url)) return;
  await fs.unlink(path.join(directory(), path.basename(url))).catch(error => {
    if (error.code !== 'ENOENT') console.error('Avatar cleanup failed:', error.code);
  });
}

async function saveAvatar(userId, file) {
  if (!file || !isValidImageMagicBytes(file.buffer)) {
    throw Object.assign(new Error('Please upload a valid JPEG, PNG, or WEBP image'), { statusCode: 400 });
  }
  // Derive the stored extension from content, never the submitted filename.
  const extension = file.buffer[0] === 0xff ? 'jpg' : file.buffer[0] === 0x89 ? 'png' : 'webp';
  const filename = `${randomUUID()}.${extension}`;
  await fs.mkdir(directory(), { recursive: true });
  const avatarUrl = `/uploads/avatars/${filename}`;
  await fs.writeFile(path.join(directory(), filename), file.buffer, { flag: 'wx' });
  let previous;
  try {
    // Return the previous avatar atomically, so concurrent uploads clean up correctly.
    previous = await User.findByIdAndUpdate(userId, { $set: { avatarUrl } }, { returnDocument: 'before' });
    if (!previous) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  } catch (error) {
    await removeFile(avatarUrl);
    throw error;
  }
  await removeFile(previous.avatarUrl);
  return userService.getProfile(await User.findById(userId));
}

async function deleteAvatar(userId) {
  const previous = await User.findByIdAndUpdate(userId, { $set: { avatarUrl: '' } }, { returnDocument: 'before' });
  if (!previous) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  await removeFile(previous.avatarUrl);
  return userService.getProfile(await User.findById(userId));
}

module.exports = { uploadAvatar, saveAvatar, deleteAvatar };
