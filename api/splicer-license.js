// Combines checkout-creation and license-verification into one function --
// Vercel's Hobby plan caps a deployment at 12 serverless functions, and these
// two (added together for the Splicer Pro feature) were the ones that pushed
// the count to 13 and silently blocked every deploy since. GET = verify an
// email's license, POST = start a checkout session for a plan.
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

async function handleVerify(req, res) {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  const customers = await stripe.customers.list({ email, limit: 10 });
  if (customers.data.length === 0) {
    return res.status(200).json({ licensed: false, plan: null });
  }

  for (const customer of customers.data) {
    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 50 });
    const lifetimePaid = sessions.data.some(s =>
      s.metadata && s.metadata.product === 'splicer-pro' && s.metadata.plan === 'lifetime' &&
      s.payment_status === 'paid'
    );
    if (lifetimePaid) {
      return res.status(200).json({ licensed: true, plan: 'lifetime' });
    }

    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 50 });
    const activeMonthly = subs.data.some(s =>
      s.metadata && s.metadata.product === 'splicer-pro' &&
      (s.status === 'active' || s.status === 'trialing')
    );
    if (activeMonthly) {
      return res.status(200).json({ licensed: true, plan: 'monthly' });
    }
  }

  res.status(200).json({ licensed: false, plan: null });
}

async function handleCheckout(req, res) {
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
    allow_promotion_codes: true,
    metadata: { product: 'splicer-pro', plan },
    subscription_data: config.mode === 'subscription' ? { metadata: { product: 'splicer-pro', plan } } : undefined,
    payment_intent_data: config.mode === 'payment' ? { metadata: { product: 'splicer-pro', plan } } : undefined,
    success_url: 'https://5starlinks.xyz/splicer-license.html?status=success',
    cancel_url: 'https://5starlinks.xyz/download.html',
  });

  res.status(200).json({ url: session.url });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') return await handleVerify(req, res);
    if (req.method === 'POST') return await handleCheckout(req, res);
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
