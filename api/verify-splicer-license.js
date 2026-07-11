const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const customers = await stripe.customers.list({ email, limit: 10 });
    if (customers.data.length === 0) {
      return res.status(200).json({ licensed: false, plan: null });
    }

    for (const customer of customers.data) {
      // Lifetime: any successful one-time splicer-pro payment for this customer.
      const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 50 });
      const lifetimePaid = sessions.data.some(s =>
        s.metadata && s.metadata.product === 'splicer-pro' && s.metadata.plan === 'lifetime' &&
        s.payment_status === 'paid'
      );
      if (lifetimePaid) {
        return res.status(200).json({ licensed: true, plan: 'lifetime' });
      }

      // Monthly: an active (or trialing) subscription created for splicer-pro.
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
