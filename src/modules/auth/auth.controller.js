const authService = require('./auth.service');
const { sendSuccess } = require('../../utils/response');

class AuthController {
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register({ name, email, password });
      return sendSuccess(res, 'User registered successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      return sendSuccess(res, 'Login successfully', result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
