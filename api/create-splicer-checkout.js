const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  monthly: {
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: '5 Star Splicer Pro (Monthly)' },
        unit_amount: 200,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
  },
  lifetime: {
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: '5 Star Splicer Pro (Lifetime)' },
        unit_amount: 2000,
      },
      quantity: 1,
    }],
  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, plan } = req.body;
    const config = PLANS[plan];
    if (!config) return res.status(400).json({ error: 'Invalid plan' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: config.mode,
      line_items: config.line_items,
      customer_email: email,
      metadata: { product: 'splicer-pro', plan },
      subscription_data: config.mode === 'subscription' ? { metadata: { product: 'splicer-pro', plan } } : undefined,
      payment_intent_data: config.mode === 'payment' ? { metadata: { product: 'splicer-pro', plan } } : undefined,
      success_url: 'https://5starlinks.xyz/splicer-license.html?status=success',
      cancel_url: 'https://5starlinks.xyz/download.html',
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
