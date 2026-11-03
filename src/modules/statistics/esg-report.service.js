const Classification = require('../classifications/classification.model');
const { SUPPORTED_WASTE_CLASSES } = require('../ai/ai.config');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Get the next calendar date.
 * Example: 2026-11-02 -> 2026-11-03
 */
function getNextDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);

  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));

  return [
    nextDate.getUTCFullYear(),
    String(nextDate.getUTCMonth() + 1).padStart(2, '0'),
    String(nextDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

class EsgReportService {
  /**
   * Generate system-wide ESG statistics for administrators.
   *
   * @param {Object} params
   * @param {string} params.from - Start date (YYYY-MM-DD)
   * @param {string} params.to - End date (YYYY-MM-DD)
   */
  async getAdminReport({ from, to }) {
    const startDate = new Date(`${from}T00:00:00+07:00`);

    const endDateExclusive = new Date(
      `${getNextDate(to)}T00:00:00+07:00`
    );

    // Filter classifications within the selected date range.
    // No userId filter because this is an administrator report.
    const filter = {
      createdAt: {
        $gte: startDate,
        $lt: endDateExclusive,
      },
    };

    const [
      totalScans,
      categoryAggregation,
      dailyAggregation,
    ] = await Promise.all([
      Classification.countDocuments(filter),

      Classification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$predictedClass',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Classification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: TIME_ZONE,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Initialize supported waste classes with zero values.
    const byWasteClass = {};

    for (const wasteClass of SUPPORTED_WASTE_CLASSES) {
      byWasteClass[wasteClass] = 0;
    }

    // Count classifications by waste category.
    for (const item of categoryAggregation) {
      const className = item._id;

      if (
        Object.prototype.hasOwnProperty.call(
          byWasteClass,
          className
        )
      ) {
        byWasteClass[className] = item.count;
      } else {
        byWasteClass.other = (byWasteClass.other || 0) + item.count;
      }
    }

    // Convert daily aggregation results.
    const dailyScans = dailyAggregation.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    return {
      period: {
        from,
        to,
        timeZone: TIME_ZONE,
      },

      hasData: totalScans > 0,

      summary: {
        totalScans,
        byWasteClass,

        // These metrics are not available in the current develop schemas.
        pointsIssued: null,
        vouchersRedeemed: null,
        wasteWeightKg: null,
        co2ReducedKg: null,
      },

      dailyScans,

      metricsAvailability: {
        totalScans: true,
        wasteClassification: true,
        pointsIssued: false,
        vouchersRedeemed: false,
        wasteWeightKg: false,
        co2ReducedKg: false,
      },

      notes: {
        pointsIssued:
          'No transaction-level points data is available on develop.',

        vouchersRedeemed:
          'Voucher redemption backend data is not available on develop.',

        wasteWeightKg:
          'No verified waste weight data is available.',

        co2ReducedKg:
          'No verified waste weight or agreed CO2 conversion factor is available.',

        classificationDate:
          'Classification records are counted using server-side createdAt.',
      },
    };
  }
}

module.exports = new EsgReportService();