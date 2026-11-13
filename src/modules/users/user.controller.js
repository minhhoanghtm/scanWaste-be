const userService = require('./user.service');
const pointsService = require('./user.points.service');
const avatarService = require('./user.avatar');
const { sendSuccess } = require('../../utils/response');

class UserController {
  async getPointHistory(req, res, next) {
    try {
      const data = await pointsService.getPointHistory(req.user._id, req.query);
      return sendSuccess(res, 'Get point history successfully', data);
    } catch (error) { next(error); }
  }

  async uploadAvatar(req, res, next) {
    try {
      const profile = await avatarService.saveAvatar(req.user._id, req.file);
      return sendSuccess(res, 'Avatar updated successfully', profile);
    } catch (error) { next(error); }
  }

  async deleteAvatar(req, res, next) {
    try {
      const profile = await avatarService.deleteAvatar(req.user._id);
      return sendSuccess(res, 'Avatar removed successfully', profile);
    } catch (error) { next(error); }
  }

  async getMe(req, res, next) {
    try {
      const profile = await userService.getProfile(req.user);
      return sendSuccess(res, 'Get profile successfully', profile, 200);
    } catch (error) {
      return next(error);
    }
  }

  async updateMe(req, res, next) {
    try {
      const userId = req.user.id || req.user._id;

      const profile = await userService.updateProfile(
        userId,
        req.body || {}
      );

      return sendSuccess(
        res,
        'Update profile successfully',
        profile,
        200
      );
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new UserController();