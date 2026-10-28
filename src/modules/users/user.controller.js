const userService = require('./user.service');
const { sendSuccess } = require('../../utils/response');

class UserController {
  async getMe(req, res, next) {
    try {
      const profile = await userService.getProfile(req.user);
      return sendSuccess(res, 'Get profile successfully', profile, 200);
    } catch (error) {
      next(error);
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
      next(error);
    }
  }
}

module.exports = new UserController();