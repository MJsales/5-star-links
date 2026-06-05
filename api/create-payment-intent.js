const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const products = {
  'ski-mask': { name: 'Ski Mask', price: 500 },
  'spider-hoodie': { name: 'Spider Hoodie', price: 500 },
  'bape-hoodie': { name: 'Bape Hoodie', price: 500 },
  'ai-picks': { name: 'AI Sports Picks', price: 500 },
  'ai-stocks': { name: 'AI Stock Picks', price: 500 },
};

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
    const { items, amount } = req.body;

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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
