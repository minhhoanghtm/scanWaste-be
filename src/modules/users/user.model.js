const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+84[35789]\d{8}$/, 'Please enter a valid Vietnamese mobile number'],
    },
    password: {
      type: String,
      required: function () { return !this.googleId; },
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    googleId: { type: String, select: false },
    emailVerified: { type: Boolean, default: false },
    authVersion: { type: Number, default: 0, select: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
        delete ret.googleId;
        delete ret.authVersion;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
        delete ret.googleId;
        delete ret.authVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Existing accounts may have no phone. Enforce uniqueness only for stored strings.
userSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: 'string' } },
});
userSchema.index({ googleId: 1 }, {
  unique: true,
  partialFilterExpression: { googleId: { $type: 'string' } },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
