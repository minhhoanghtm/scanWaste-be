/**
 * Nạp 15 trạm thu gom MÔ PHỎNG vào MongoDB (UC005, UC006, UC012).
 *
 *   npm run seed:stations
 *
 * Chạy lại nhiều lần không tạo trùng: trạm được nhận diện theo `code` (st-01 … st-15).
 * Lần chạy sau đưa sức chứa/trạng thái về giá trị demo ban đầu (dùng trước buổi demo).
 * Không xoá bất kỳ dữ liệu nào khác.
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Station = require('../src/modules/stations/station.model');
const seedData = require('../src/modules/stations/station.seed-data');

async function seedStations() {
  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const { coordinates, capacityMinutesAgo, ...fields } of seedData) {
    const values = {
      ...fields,
      location: { type: 'Point', coordinates },
      capacityUpdatedAt: new Date(now - capacityMinutesAgo * 60_000),
    };
    const existing = await Station.findOne({ code: fields.code });
    if (existing) {
      existing.set(values);
      await existing.save(); // save() để hook tính lại searchText
      updated += 1;
    } else {
      await Station.create(values);
      created += 1;
    }
  }
  return { created, updated };
}

if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(env.MONGODB_URI);
      await Station.init(); // bảo đảm index 2dsphere đã được tạo
      const { created, updated } = await seedStations();
      console.log(`[seed:stations] ${created} trạm mới, ${updated} trạm cập nhật – DB: ${mongoose.connection.name}`);
    } catch (error) {
      console.error('[seed:stations] Lỗi:', error.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}

module.exports = { seedStations };
