
const nodemailer = require('nodemailer');

const env = require('../../config/env');
const User = require('../users/user.model');
const VoucherWallet = require('./voucher-wallet.model');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 3 * DAY_MS;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

// Support both SMTP_FROM and the older MAIL_FROM setting.
function getMailFrom() {
  return env.SMTP_FROM || process.env.MAIL_FROM || env.SMTP_USER || '';
}

function isSmtpConfigured() {
  return Boolean(
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    getMailFrom()
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

// Send reminders for vouchers expiring within three days.
async function sendExpiringVoucherReminders() {
  const transporter = createTransporter();

  const summary = {
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Verify SMTP before processing any voucher.
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

      // Atomically claim the voucher to prevent concurrent reminders.
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
          timeZone: TIME_ZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const userName = user.name || 'bạn';
        const voucherName = claimedVoucher.voucherName;
        const partnerName = claimedVoucher.partnerName || 'ScanWaste';
        const voucherCode = claimedVoucher.voucherCode;

        const text = [
          `Xin chào ${userName},`,
          '',
          `Voucher "${voucherName}" sắp hết hạn.`,
          `Đối tác: ${partnerName}`,
          `Mã voucher: ${voucherCode}`,
          `Hạn sử dụng: ${expirationText} (giờ Việt Nam).`,
          '',
          'Vui lòng mở ứng dụng ScanWaste để sử dụng voucher trước khi hết hạn.',
        ].join('\n');

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Nhắc hạn voucher - ScanWaste</h2>
            <p>Xin chào ${escapeHtml(userName)},</p>
            <p>Voucher của bạn sắp hết hạn trong 3 ngày tới.</p>
            <p><strong>Tên voucher:</strong> ${escapeHtml(voucherName)}</p>
            <p><strong>Đối tác:</strong> ${escapeHtml(partnerName)}</p>
            <p><strong>Mã voucher:</strong> ${escapeHtml(voucherCode)}</p>
            <p><strong>Hạn sử dụng:</strong> ${escapeHtml(expirationText)} (giờ Việt Nam)</p>
            <p>Vui lòng mở ứng dụng ScanWaste để sử dụng trước khi hết hạn.</p>
          </div>
        `;

        await transporter.sendMail({
          from: {
            name: 'ScanWaste',
            address: getMailFrom(),
          },
          to: user.email,
          subject: '[ScanWaste] Voucher của bạn sắp hết hạn',
          text,
          html,
        });

        const updateResult = await VoucherWallet.updateOne(
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

        if (updateResult.matchedCount !== 1) {
          // Email was sent, but the reminder marker could not be confirmed.
          summary.failed += 1;

          console.error(
            `[VoucherReminder] Email sent but reminder marker was not updated for voucher ${claimedVoucher._id}`
          );

          continue;
        }

        summary.sent += 1;

        console.log(
          `[VoucherReminder] Email sent for voucher ${claimedVoucher._id}`
        );
      } catch (error) {
        summary.failed += 1;

        try {
          await releaseClaim(claimedVoucher._id, claimAt);
        } catch (releaseError) {
          console.error(
            '[VoucherReminder] Failed to release claim:',
            releaseError.message
          );
        }

        console.error(
          `[VoucherReminder] Failed for voucher ${voucher._id}:`,
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

// Vietnam uses UTC+7. 09:00 Vietnam time equals 02:00 UTC.
function getNextReminderTime(now = new Date()) {
  const vietnamOffsetMs = 7 * 60 * 60 * 1000;

  const vietnamNow = new Date(
    now.getTime() + vietnamOffsetMs
  );

  let nextRunUtc = Date.UTC(
    vietnamNow.getUTCFullYear(),
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate(),
    2,
    0,
    0,
    0
  );

  if (nextRunUtc <= now.getTime()) {
    nextRunUtc += DAY_MS;
  }

  return new Date(nextRunUtc);
}

// Schedule one run every day at 09:00 Vietnam time.
function scheduleVoucherReminderJob() {
  if (!isSmtpConfigured()) {
    console.warn(
      '[VoucherReminder] SMTP is not configured. Daily reminders are disabled.'
    );

    return null;
  }

  let timer = null;
  let stopped = false;

  async function scheduleNextRun() {
    if (stopped) return;

    const nextRun = getNextReminderTime();
    const delay = Math.max(0, nextRun.getTime() - Date.now());

    console.log(
      `[VoucherReminder] Next run: ${nextRun.toLocaleString('vi-VN', {
        timeZone: TIME_ZONE,
      })} (${TIME_ZONE})`
    );

    timer = setTimeout(async () => {
      timer = null;

      try {
        await sendExpiringVoucherReminders();
      } catch (error) {
        console.error(
          '[VoucherReminder] Scheduled run failed:',
          error.message
        );
      } finally {
        await scheduleNextRun();
      }
    }, delay);

    // The HTTP server already keeps the process alive.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  scheduleNextRun();

  console.log(
    '[VoucherReminder] Daily reminder scheduler initialized.'
  );

  return {
    stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

module.exports = {
  isSmtpConfigured,
  sendExpiringVoucherReminders,
  scheduleVoucherReminderJob,
  getNextReminderTime,
};
