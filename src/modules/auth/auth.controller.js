const authService = require('./auth.service');
const { sendSuccess } = require('../../utils/response');

class AuthController {
  async register(req, res, next) {
    try {
      const { name, email, phone, password } = req.body;
      const result = await authService.register({ name, email, phone, password });
      return sendSuccess(res, 'Check your email to complete registration', result, 202);
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { identifier, password } = req.body;
      const result = await authService.login({ identifier, password });
      return sendSuccess(res, 'Check your email to complete login', result, 202);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
