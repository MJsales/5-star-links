const https = require('https');
const http = require('http');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Admin Stripe income report (folded in from the old get-income function to
  // stay under Vercel's 12-function cap). Requested with ?type=income + admin key.
  if (req.query.type === 'income') return handleIncome(req, res);

  const { chain, address } = req.query;
  if (!chain || !address) return res.status(400).json({ error: 'chain and address required' });

  try {
    const balance = await fetchBalance(chain, address);
    res.status(200).json({ chain, address, balance });
  } catch (e) {
    res.status(200).json({ chain, address, balance: null, error: e.message });
  }
};

async function handleIncome(req, res) {
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
}

function isEvmAddress(addr) { return /^0x[0-9a-fA-F]{40}$/.test(addr); }
function isSolanaAddress(addr) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) && !addr.startsWith('0x'); }

async function fetchBalance(chain, address) {
  const evmChains = ['ETH','USDC','USDT','DAI','BUSD','LINK','UNI','AAVE','MKR','CRV','LDO','SUSHI','SHIB','PEPE','FLOKI','WIF','BONK','GRT','RENDER','MATIC','ARB','OP','BASE','BNB','IMX'];
  const solanaTokens = ['SOL','USDC','USDT','JUP','BONK','WIF','PEPE','SHIB'];

  if (isEvmAddress(address) && evmChains.includes(chain)) {
    if (chain === 'BNB') {
      const d = await fetchJSON('https://api.bscscan.com/api?module=account&action=balance&address=' + address + '&tag=latest');
      if (d.status === '1') return parseInt(d.result) / 1e18;
    } else if (chain === 'MATIC') {
      const d = await fetchJSON('https://api.polygonscan.com/api?module=account&action=balance&address=' + address + '&tag=latest');
      if (d.status === '1') return parseInt(d.result) / 1e18;
    } else if (chain === 'ARB') {
      const d = await fetchJSON('https://api.arbiscan.io/api?module=account&action=balance&address=' + address + '&tag=latest');
      if (d.status === '1') return parseInt(d.result) / 1e18;
    } else if (chain === 'OP') {
      const d = await fetchJSON('https://api-optimistic.etherscan.io/api?module=account&action=balance&address=' + address + '&tag=latest');
      if (d.status === '1') return parseInt(d.result) / 1e18;
    } else if (chain === 'BASE') {
      const d = await fetchJSON('https://api.basescan.org/api?module=account&action=balance&address=' + address + '&tag=latest');
      if (d.status === '1') return parseInt(d.result) / 1e18;
    } else {
      if (chain === 'ETH') {
        const d = await fetchJSON('https://api.etherscan.io/api?module=account&action=balance&address=' + address + '&tag=latest');
        if (d.status === '1') return parseInt(d.result) / 1e18;
      } else {
        const d = await fetchJSON('https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=' + getTokenContract(chain) + '&address=' + address + '&tag=latest');
        if (d.status === '1') return parseInt(d.result) / 1e6;
      }
    }
    throw new Error('evm failed');
  }

  if (isSolanaAddress(address)) {
    if (chain === 'SOL') {
      const d = await postJSON('https://api.mainnet-beta.solana.com', { jsonrpc:'2.0', id:1, method:'getBalance', params:[address] });
      if (d.result) return d.result.value / 1e9;
      throw new Error('solana failed');
    }
    const mint = getSolanaMint(chain);
    if (mint) {
      const d = await postJSON('https://api.mainnet-beta.solana.com', {
        jsonrpc:'2.0', id:1, method:'getTokenAccountsByOwner',
        params:[address, { mint: mint }, { encoding:'jsonParsed' }]
      });
      if (d.result && d.result.value && d.result.value.length > 0) {
        const amount = d.result.value[0].account.data.parsed.info.tokenAmount.amount;
        const decimals = d.result.value[0].account.data.parsed.info.tokenAmount.decimals;
        return parseInt(amount) / Math.pow(10, decimals);
      }
      return 0;
    }
    throw new Error('unknown solana token');
  }

  if (chain === 'BTC') {
    const d = await fetchJSON('https://blockchain.info/q/addressbalance/' + address);
    return parseInt(d) / 1e8;
  }
  if (chain === 'DOGE') {
    const d = await fetchJSON('https://dogechain.info/api/v1/address/balance/' + address);
    if (d.balance !== undefined) return parseFloat(d.balance);
  }
  if (chain === 'XRP') {
    const d = await fetchJSON('https://api.xrpscan.com/api/v1/account/' + address);
    if (d.balance) return parseFloat(d.balance);
  }
  if (chain === 'TRX') {
    const d = await fetchJSON('https://api.trongrid.io/v1/accounts/' + address);
    if (d.data && d.data[0]) return d.data[0].balance / 1e6;
  }
  if (chain === 'LTC') {
    const d = await fetchJSON('https://api.blockcypher.com/v1/ltc/main/addrs/' + address + '/balance');
    if (d.balance) return d.balance / 1e8;
  }
  if (chain === 'NEAR') {
    const d = await postJSON('https://rpc.mainnet.near.org', { jsonrpc:'2.0', id:1, method:'query', params:[address, 'account'] });
    if (d.result && d.result.amount) return parseInt(d.result.amount) / 1e24;
  }
  if (chain === 'ADA') {
    const d = await fetchJSON('https://api.koios.rest/api/v0/address_info?_address=' + address);
    if (d[0] && d[0].balance) return parseInt(d[0].balance) / 1e6;
  }
  if (chain === 'SUI') {
    const d = await postJSON('https://fullnode.mainnet.sui.io:443', { jsonrpc:'2.0', id:1, method:'suix_getBalance', params:[address] });
    if (d.result && d.result.totalBalance) return parseInt(d.result.totalBalance) / 1e9;
  }
  return null;
}

function getTokenContract(symbol) {
  const contracts = {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    PEPE: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
    FLOKI: '0xcf0C122c6b73ff809C6c2f7c41d95350f8dBF052',
    WIF: '0x4d224452801ACEd8B2F0aebE155379bb5D594381',
    BONK: '0x115eC79f737C4E383276EF4A5D1b74045a461D48',
    AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    MKR: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    CRV: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    LDO: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    SUSHI: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  };
  return contracts[symbol] || null;
}

function getSolanaMint(symbol) {
  const mints = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    PEPE: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    SHIB: 'CiKu4ejWDzU1d9sqScSh7TVJcxKt4pkH2vXhN6PFP4i8',
  };
  return mints[symbol] || null;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('parse')); } });
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const postData = JSON.stringify(body);
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } };
    const req = client.request(opts, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('parse')); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
