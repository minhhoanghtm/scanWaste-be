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

class UserService {
  async getUserById(userId) {
    const user = await User.findById(userId);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
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
      totalPoints: points,
      totalClassifications: Number(user.totalClassifications || 0),
      currentStreak: Number(user.currentStreak || 0),
      tier: getTier(points),
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

  async updateProfile(userId, payload) {
    const allowedFields = ['name', 'email', 'phone'];
    const updates = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        if (typeof payload[field] !== 'string') {
          const error = new Error(`${field} must be a string`);
          error.statusCode = 400;
          throw error;
        }

        updates[field] = payload[field].trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      const error = new Error('No valid profile fields provided');
      error.statusCode = 400;
      throw error;
    }

    if (updates.email) {
      updates.email = updates.email.toLowerCase();
    }

    try {
      const user = await User.findByIdAndUpdate(userId, updates, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      return this.getProfile(user);
    } catch (error) {
      if (error.code === 11000) {
        const conflictError = new Error('Email already exists');
        conflictError.statusCode = 409;
        throw conflictError;
      }

      throw error;
    }
  }

  async recordClassificationActivity(
    userId,
    totalClassifications,
    pointsToAdd = 10
  ) {
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
    user.totalPoints =
      Number(user.totalPoints || 0) + Number(pointsToAdd || 0);
    user.totalClassifications = totalClassifications;
    user.tier = getTier(user.totalPoints);

    const earnedBadges = [
      {
        name: 'TÃ¢n binh xanh',
        description: 'HoÃ n thÃ nh lÆ°á»£t phÃ¢n loáº¡i rÃ¡c Ä‘áº§u tiÃªn.',
        condition: totalClassifications >= 1,
      },
      {
        name: 'Chiáº¿n tháº§n phÃ¢n loáº¡i',
        description: 'HoÃ n thÃ nh 10 lÆ°á»£t phÃ¢n loáº¡i rÃ¡c.',
        condition: totalClassifications >= 10,
      },
      {
        name: 'ChuyÃªn gia tÃ¡i cháº¿',
        description: 'HoÃ n thÃ nh 50 lÆ°á»£t phÃ¢n loáº¡i rÃ¡c.',
        condition: totalClassifications >= 50,
      },
      {
        name: 'Sá»‘ng xanh bá»n bá»‰',
        description: 'Duy trÃ¬ chuá»—i hoáº¡t Ä‘á»™ng 7 ngÃ y liÃªn tiáº¿p.',
        condition: user.currentStreak >= 7,
      },
    ];

    const existingBadges = new Set(
      (user.badges || []).map((badge) => badge.name)
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

  // UC011: Cong diem bo sung sau khi admin duyet anh
  async addPoints(userId, pointsToAdd) {
    const points = Number(pointsToAdd);

    if (!Number.isFinite(points) || points <= 0) {
      const error = new Error('Points must be greater than 0');
      error.statusCode = 400;
      throw error;
    }

    const user = await this.getUserById(userId);

    user.totalPoints = Number(user.totalPoints || 0) + points;
    user.tier = getTier(user.totalPoints);

    await user.save();

    return this.getProfile(user);
  }
}

module.exports = new UserService();