const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const balance = await stripe.balance.retrieve();

    let charges = [];
    let startingAfter;
    for (let page = 0; page < 10; page++) {
      const params = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const result = await stripe.charges.list(params);
      charges = charges.concat(result.data);
      if (!result.has_more || result.data.length === 0) break;
      startingAfter = result.data[result.data.length - 1].id;
    }

    const succeeded = charges.filter(c => c.status === 'succeeded');
    const totalGrossCents = succeeded.reduce((sum, c) => sum + c.amount, 0);
    const totalRefundedCents = charges.reduce((sum, c) => sum + c.amount_refunded, 0);

    const byDay = {};
    succeeded.forEach(c => {
      const day = new Date(c.created * 1000).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + c.amount;
    });

    res.status(200).json({
      availableBalance: balance.available.map(b => ({ amountCents: b.amount, currency: b.currency })),
      pendingBalance: balance.pending.map(b => ({ amountCents: b.amount, currency: b.currency })),
      totalGrossCents,
      totalRefundedCents,
      chargeCount: succeeded.length,
      chargesCapped: charges.length >= 1000,
      byDay,
      recentCharges: succeeded
        .slice()
        .sort((a, b) => b.created - a.created)
        .slice(0, 25)
        .map(c => ({
          amountCents: c.amount,
          currency: c.currency,
          created: c.created,
          description: c.description,
          email: c.receipt_email,
        })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
