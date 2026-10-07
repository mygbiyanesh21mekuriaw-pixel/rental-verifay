const LandlordCredit = require('../models/LandlordCredit');
const Payment = require('../models/Payment');
const { processLandlordPayout } = require('./landlordPayoutService');
const { isSandboxTransferMode } = require('../utils/payoutProvider');

const RECONCILIATION_INTERVAL_MS = 60_000;
let reconciliationInProgress = false;

const reconcilePendingPayouts = async () => {
  if (reconciliationInProgress) return;
  reconciliationInProgress = true;

  try {
    const sandboxMode = isSandboxTransferMode();
    const credits = await LandlordCredit.find({
      status: 'CREDITED',
      $and: [{
        $or: [
          ...(sandboxMode
            ? [
              {
                paymentMode: 'sandbox',
                $or: [
                  { sandboxTransferStatus: 'PROCESSING' },
                  { sandboxTransferStatus: { $exists: false } },
                ],
              },
            ]
            : [
              {
                paymentMode: 'live',
                externalTransferStatus: { $in: ['NOT_EXECUTED', 'PENDING', 'PROCESSING'] },
              },
              {
                paymentMode: 'live',
                externalTransferStatus: { $exists: false },
              },
            ]),
        ],
      }],
    }).select('payment').lean();

    for (const credit of credits) {
      try {
        const payment = await Payment.findById(credit.payment);
        if (payment) await processLandlordPayout(payment);
      } catch (error) {
        console.error(`[PAYOUT] Reconciliation failed for payment ${credit.payment}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[PAYOUT] Unable to load pending payouts for reconciliation:', error.message);
  } finally {
    reconciliationInProgress = false;
  }
};

const startPayoutReconciliation = () => {
  void reconcilePendingPayouts();
  const interval = setInterval(reconcilePendingPayouts, RECONCILIATION_INTERVAL_MS);
  interval.unref();
  return interval;
};

module.exports = { reconcilePendingPayouts, startPayoutReconciliation };
