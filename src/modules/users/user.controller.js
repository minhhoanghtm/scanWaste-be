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
}

module.exports = new UserController();
