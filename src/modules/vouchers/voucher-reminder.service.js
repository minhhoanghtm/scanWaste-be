const cron = require('node-cron');
const nodemailer = require('nodemailer');

const env = require('../../config/env');
const User = require('../users/user.model');
const VoucherWallet = require('./voucher-wallet.model');

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

function isSmtpConfigured() {
  return Boolean(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.MAIL_FROM
  );
}

function createTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error(
      'SMTP is not configured. Check SMTP settings in .env.'
    );
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[char];
  });
}

async function releaseClaim(voucherId, claimAt) {
  await VoucherWallet.updateOne(
    {
      _id: voucherId,
      reminderEmailClaimedAt: claimAt,
    },
    {
      $unset: {
        reminderEmailClaimedAt: 1,
      },
    }
  );
}

async function sendExpiringVoucherReminders() {
  const transporter = createTransporter();

  const summary = {
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Kiểm tra SMTP trước khi xử lý voucher.
    await transporter.verify();

    const now = new Date();
    const reminderLimit = new Date(
      now.getTime() + REMINDER_WINDOW_MS
    );
    const staleClaimBefore = new Date(
      now.getTime() - CLAIM_TIMEOUT_MS
    );

    const eligibleQuery = {
      status: 'active',
      expiresAt: {
        $gt: now,
        $lte: reminderLimit,
      },
      reminderEmailSentAt: null,
      $or: [
        { reminderEmailClaimedAt: null },
        { reminderEmailClaimedAt: { $exists: false } },
        { reminderEmailClaimedAt: { $lt: staleClaimBefore } },
      ],
    };

    const vouchers = await VoucherWallet.find(eligibleQuery)
      .select('userId voucherName partnerName voucherCode expiresAt')
      .sort({ expiresAt: 1 })
      .lean();

    summary.checked = vouchers.length;

    for (const voucher of vouchers) {
      const claimAt = new Date();

      // Chỉ một tiến trình được nhận xử lý voucher tại một thời điểm.
      const claimedVoucher = await VoucherWallet.findOneAndUpdate(
        {
          ...eligibleQuery,
          _id: voucher._id,
        },
        {
          $set: {
            reminderEmailClaimedAt: claimAt,
          },
        },
        {
          new: true,
        }
      ).select('userId voucherName partnerName voucherCode expiresAt');

      if (!claimedVoucher) {
        summary.skipped += 1;
        continue;
      }

      try {
        const user = await User.findById(
          claimedVoucher.userId
        ).select('name email');

        if (
          !user ||
          !user.email ||
          !/^\S+@\S+\.\S+$/.test(user.email)
        ) {
          summary.skipped += 1;
          await releaseClaim(claimedVoucher._id, claimAt);
          continue;
        }

        const expirationText = new Date(
          claimedVoucher.expiresAt
        ).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const userName = escapeHtml(user.name || 'bạn');
        const voucherName = escapeHtml(
          claimedVoucher.voucherName
        );
        const partnerName = escapeHtml(
          claimedVoucher.partnerName || 'ScanWaste'
        );
        const voucherCode = escapeHtml(
          claimedVoucher.voucherCode
        );

        const text = [
          `Xin chào ${user.name || 'bạn'},`,
          '',
          `Voucher "${claimedVoucher.voucherName}" sắp hết hạn.`,
          `Đối tác: ${claimedVoucher.partnerName || 'ScanWaste'}`,
          `Mã voucher: ${claimedVoucher.voucherCode}`,
          `Hạn sử dụng: ${expirationText} (giờ Việt Nam).`,
          '',
          'Vui lòng mở ứng dụng ScanWaste để sử dụng voucher trước khi hết hạn.',
        ].join('\n');

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Nhắc hạn voucher - ScanWaste</h2>
            <p>Xin chào ${userName},</p>
            <p>Voucher của bạn sắp hết hạn trong 3 ngày tới.</p>
            <p><strong>Tên voucher:</strong> ${voucherName}</p>
            <p><strong>Đối tác:</strong> ${partnerName}</p>
            <p><strong>Mã voucher:</strong> ${voucherCode}</p>
            <p><strong>Hạn sử dụng:</strong> ${expirationText} (giờ Việt Nam)</p>
            <p>Vui lòng mở ứng dụng ScanWaste để sử dụng trước khi hết hạn.</p>
          </div>
        `;

        await transporter.sendMail({
          from: {
            name: 'ScanWaste',
            address: env.MAIL_FROM,
          },
          to: user.email,
          subject: '[ScanWaste] Voucher của bạn sắp hết hạn',
          text,
          html,
        });

        await VoucherWallet.updateOne(
          {
            _id: claimedVoucher._id,
            reminderEmailClaimedAt: claimAt,
          },
          {
            $set: {
              reminderEmailSentAt: new Date(),
            },
            $unset: {
              reminderEmailClaimedAt: 1,
            },
          }
        );

        summary.sent += 1;

        console.log(
          `[VoucherReminder] Email sent for voucher ${claimedVoucher.voucherCode}`
        );
      } catch (error) {
        summary.failed += 1;

        await releaseClaim(claimedVoucher._id, claimAt);

        console.error(
          `[VoucherReminder] Failed for voucher ${voucher.voucherCode}:`,
          error.message
        );
      }
    }

    console.log('[VoucherReminder] Run completed:', summary);
    return summary;
  } finally {
    transporter.close();
  }
}

function scheduleVoucherReminderJob() {
  if (!isSmtpConfigured()) {
    console.warn(
      '[VoucherReminder] SMTP is not configured. Daily email reminders are disabled.'
    );
    return null;
  }

  const task = cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        await sendExpiringVoucherReminders();
      } catch (error) {
        console.error(
          '[VoucherReminder] Scheduled run failed:',
          error.message
        );
      }
    },
    {
      timezone: 'Asia/Ho_Chi_Minh',
      noOverlap: true,
    }
  );

  console.log(
    '[VoucherReminder] Scheduled daily at 09:00 Asia/Ho_Chi_Minh.'
  );

  return task;
}

module.exports = {
  sendExpiringVoucherReminders,
  scheduleVoucherReminderJob,
};