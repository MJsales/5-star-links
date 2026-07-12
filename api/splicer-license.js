// Combines checkout-creation and license-verification into one function --
// Vercel's Hobby plan caps a deployment at 12 serverless functions, and these
// two (added together for the Splicer Pro feature) were the ones that pushed
// the count to 13 and silently blocked every deploy since. GET = verify an
// email's license, POST = start a checkout session for a plan.
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const VALID_PLANS = ['monthly', 'lifetime'];

async function handleVerify(req, res) {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  const customers = await stripe.customers.list({ email, limit: 10 });
  if (customers.data.length === 0) {
    return res.status(200).json({ licensed: false, plan: null });
  }

  for (const customer of customers.data) {
    const intents = await stripe.paymentIntents.list({ customer: customer.id, limit: 50 });
    const lifetimePaid = intents.data.some(pi =>
      pi.metadata && pi.metadata.product === 'splicer-pro' && pi.metadata.plan === 'lifetime' &&
      pi.status === 'succeeded'
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

async function resolvePromo(promoCode) {
  if (!promoCode) return null;
  const codes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
  return codes.data[0] || null;
}

// Embedded-payment flow (card form inside the app itself, via Stripe Elements)
// instead of redirecting out to a hosted Checkout page. Lifetime is a plain
// PaymentIntent; monthly is a Customer + Subscription with the first invoice's
// PaymentIntent handed back for confirmCardPayment().
async function handleCheckout(req, res) {
  const { email, plan, promoCode } = req.body;
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const promo = await resolvePromo(promoCode);
  if (promoCode && !promo) return res.status(400).json({ error: 'Invalid or expired promo code' });

  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers.data[0] || await stripe.customers.create({ email });

  if (plan === 'lifetime') {
    let amount = 2000;
    if (promo) {
      const c = promo.coupon;
      amount = c.percent_off ? Math.round(amount * (1 - c.percent_off / 100)) : Math.max(0, amount - (c.amount_off || 0));
    }
    if (amount === 0) return res.status(200).json({ free: true });

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customer.id,
      receipt_email: email,
      metadata: { product: 'splicer-pro', plan: 'lifetime' },
    });
    return res.status(200).json({ clientSecret: intent.client_secret, mode: 'payment' });
  }

  // monthly
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price_data: { currency: 'usd', product_data: { name: '5 Star Splicer Pro (Monthly)' }, unit_amount: 200, recurring: { interval: 'month' } } }],
    discounts: promo ? [{ promotion_code: promo.id }] : undefined,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: { product: 'splicer-pro', plan: 'monthly' },
  });

  if (subscription.status === 'active') {
    // $0 first invoice (100%-off promo) -- Stripe skips creating a PaymentIntent entirely.
    return res.status(200).json({ free: true });
  }

  const clientSecret = subscription.latest_invoice && subscription.latest_invoice.payment_intent
    ? subscription.latest_invoice.payment_intent.client_secret
    : null;
  if (!clientSecret) return res.status(500).json({ error: 'Could not start subscription payment' });

  res.status(200).json({ clientSecret, mode: 'subscription' });
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
