const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const products = {
  'ski-mask': { name: 'Ski Mask', price: 500 },
  'spider-hoodie': { name: 'S Hoodie', price: 500 },
  'bape-hoodie': { name: 'B Hoodie', price: 500 },
  'ai-video': { name: 'AI Video Splicer', price: 500 },
  'discord-vip': { name: 'Discord VIP', price: 500 },
  'website-build': { name: 'Custom Website Build', price: 50000 },
};

// Project details from website.html ride along on the PaymentIntent so they
// show up next to the charge in the Stripe dashboard. Client-supplied, so only
// known keys are kept and each value is truncated to Stripe's 500-char limit.
const METADATA_KEYS = ['name', 'email', 'business', 'siteType', 'details'];

function cleanMetadata(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  METADATA_KEYS.forEach(k => {
    if (raw[k] == null) return;
    const v = String(raw[k]).trim();
    if (v) out[k] = v.slice(0, 500);
  });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, amount, metadata } = req.body;

    let totalAmount = 0;

    if (amount) {
      totalAmount = amount;
    } else if (items) {
      items.forEach(item => {
        const product = products[item.id];
        if (product) totalAmount += product.price * (item.quantity || 1);
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const meta = cleanMetadata(metadata);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      ...(Object.keys(meta).length ? { metadata: meta } : {}),
      ...(meta.email ? { receipt_email: meta.email } : {}),
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
