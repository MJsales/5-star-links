require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const PORT = 4242;

const products = {
  'ski-mask': { name: 'Ski Mask', price: 500 },
  'spider-hoodie': { name: 'Spider Hoodie', price: 500 },
  'bape-hoodie': { name: 'Bape Hoodie', price: 500 },
};

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { items } = req.body;

    let totalAmount = 0;
    items.forEach(item => {
      const product = products[item.id];
      totalAmount += product.price * (item.quantity || 1);
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/confirm-payment', async (req, res) => {
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
