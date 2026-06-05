const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.env.VERCEL ? '/tmp' : __dirname, '..', 'data');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll() {
  ensureDir();
  if (!fs.existsSync(WALLETS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8')); } catch(e) { return {}; }
}

function saveAll(data) {
  ensureDir();
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'uid required' });

  const all = loadAll();

  if (req.method === 'GET') {
    return res.status(200).json({ wallets: all[uid] || [] });
  }

  if (req.method === 'POST') {
    const { wallets } = req.body;
    if (!Array.isArray(wallets)) return res.status(400).json({ error: 'wallets array required' });
    all[uid] = wallets;
    saveAll(all);
    return res.status(200).json({ ok: true, count: wallets.length });
  }

  if (req.method === 'DELETE') {
    delete all[uid];
    saveAll(all);
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'method not allowed' });
};
