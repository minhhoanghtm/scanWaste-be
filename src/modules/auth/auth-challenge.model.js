const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String },
  provider: { type: String, enum: ['google'], required: true },
  nonce: { type: String, required: true },
  state: { type: String, required: true },
  browserHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('AuthChallenge', schema);
