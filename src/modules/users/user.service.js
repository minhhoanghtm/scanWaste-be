
const User = require('./user.model');

const DAY_MS = 24 * 60 * 60 * 1000;

function getTier(points) {
  if (points >= 1000) return 'Platinum';
  if (points >= 500) return 'Gold';
  if (points >= 100) return 'Silver';
  return 'Bronze';
}

function getUtcDay(date) {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

class UserService {
  async getUserById(userId) {
    const user = await User.findById(userId);

    if (!user) {
      throw createError('User not found', 404);
    }

    return user;
  }

  async getProfile(user) {
    const points = Number(user.totalPoints || 0);

    return {
      id: user.id || user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      emailVerified: user.emailVerified,
      totalPoints: points,
      totalClassifications: Number(user.totalClassifications || 0),
      currentStreak: Number(user.currentStreak || 0),
      tier: user.tier || getTier(points),
      badges: (user.badges || []).map((badge) => ({
        id: badge.id || badge._id,
        name: badge.name,
        description: badge.description,
        earnedAt: badge.earnedAt,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateProfile(userId, payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw createError('Invalid profile data', 400);
    }

    const existingUser = await this.getUserById(userId);
    const updates = {};
    const unsetFields = {};

    const allowedFields = ['name', 'email', 'phone'];

    for (const field of allowedFields) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) {
        continue;
      }

      const value = payload[field];

      if (field === 'phone' && (value === null || value === '')) {
        unsetFields.phone = 1;
        continue;
      }

      if (typeof value !== 'string') {
        throw createError(`${field} must be a string`, 400);
      }

      updates[field] = value.trim();

      if (field === 'email') {
        updates.email = updates.email.toLowerCase();
      }
    }

    if (
      Object.keys(updates).length === 0 &&
      Object.keys(unsetFields).length === 0
    ) {
      throw createError('No valid profile fields provided', 400);
    }

    if (updates.email && updates.email !== existingUser.email) {
      updates.emailVerified = false;
    }

    const updateQuery = {};

    if (Object.keys(updates).length > 0) {
      updateQuery.$set = updates;
    }

    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    try {
      const user = await User.findByIdAndUpdate(userId, updateQuery, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        throw createError('User not found', 404);
      }

      return this.getProfile(user);
    } catch (error) {
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0];

        if (duplicateField === 'phone') {
          throw createError('Phone number already exists', 409);
        }

        if (duplicateField === 'email') {
          throw createError('Email already exists', 409);
        }
      }

      throw error;
    }
  }

  async recordClassificationActivity(
    userId,
    totalClassifications,
    pointsToAdd = 10
  ) {
    const total = Number(totalClassifications);
    const points = Number(pointsToAdd);

    if (!Number.isInteger(total) || total < 0) {
      throw createError('Invalid classification count', 400);
    }

    if (!Number.isFinite(points) || points < 0) {
      throw createError('Invalid points value', 400);
    }

    const user = await this.getUserById(userId);
    const now = new Date();
    const today = new Date(getUtcDay(now));
    const lastActivity = user.lastActivityDate;

    if (!lastActivity) {
      user.currentStreak = 1;
    } else {
      const dayDiff = Math.floor(
        (getUtcDay(today) - getUtcDay(new Date(lastActivity))) / DAY_MS
      );

      if (dayDiff === 0) {
        user.currentStreak = Math.max(user.currentStreak || 0, 1);
      } else if (dayDiff === 1) {
        user.currentStreak = (user.currentStreak || 0) + 1;
      } else {
        user.currentStreak = 1;
      }
    }

    user.lastActivityDate = today;
    user.totalPoints = Number(user.totalPoints || 0) + points;
    user.totalClassifications = total;
    user.tier = getTier(user.totalPoints);

    if (!Array.isArray(user.badges)) {
      user.badges = [];
    }

    const earnedBadges = [
      {
        name: 'Tân binh xanh',
        description: 'Hoàn thành lượt phân loại rác đầu tiên.',
        condition: total >= 1,
      },
      {
        name: 'Chiến thần phân loại',
        description: 'Hoàn thành 10 lượt phân loại rác.',
        condition: total >= 10,
      },
      {
        name: 'Chuyên gia tái chế',
        description: 'Hoàn thành 50 lượt phân loại rác.',
        condition: total >= 50,
      },
      {
        name: 'Sống xanh bền bỉ',
        description: 'Duy trì chuỗi hoạt động 7 ngày liên tiếp.',
        condition: user.currentStreak >= 7,
      },
    ];

    const existingBadges = new Set(
      user.badges.map((badge) => badge.name)
    );

    for (const badge of earnedBadges) {
      if (badge.condition && !existingBadges.has(badge.name)) {
        user.badges.push({
          name: badge.name,
          description: badge.description,
          earnedAt: now,
        });

        existingBadges.add(badge.name);
      }
    }

    await user.save();

    return this.getProfile(user);
  }

  async addPoints(userId, pointsToAdd, options = {}) {
    const points = Number(pointsToAdd);
    const session = options.session;

    if (!Number.isFinite(points) || points <= 0) {
      throw createError('Points must be greater than 0', 400);
    }

    const query = User.findById(userId);

    if (session) {
      query.session(session);
    }

    const user = await query;

    if (!user) {
      throw createError('User not found', 404);
    }

    user.totalPoints = Number(user.totalPoints || 0) + points;
    user.tier = getTier(user.totalPoints);

    if (session) {
      await user.save({ session });
    } else {
      await user.save();
    }

    return this.getProfile(user);
  }
}

module.exports = new UserService();
