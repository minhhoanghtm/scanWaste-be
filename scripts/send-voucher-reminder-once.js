const mongoose = require('mongoose');

const { connectDB } = require('../src/config/database');
const {
  sendExpiringVoucherReminders,
} = require('../src/modules/vouchers/voucher-reminder.service');

async function main() {
  await connectDB();

  const result = await sendExpiringVoucherReminders();

  console.log(
    '[VoucherReminder] Manual test result:',
    JSON.stringify(result, null, 2)
  );
}

main()
  .catch((error) => {
    console.error(
      '[VoucherReminder] Manual test failed:',
      error.message
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });