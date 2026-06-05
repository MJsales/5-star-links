const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { chain, address } = req.query;
  if (!chain || !address) {
    return res.status(400).json({ error: 'chain and address required' });
  }

  try {
    const balance = await fetchBalance(chain, address);
    res.status(200).json({ chain, address, balance });
  } catch (e) {
    res.status(200).json({ chain, address, balance: null, error: e.message });
  }
};

async function fetchBalance(chain, address) {
  if (chain === 'BTC') {
    const data = await fetchJSON(`https://blockchain.info/q/addressbalance/${address}`);
    return parseInt(data) / 1e8;
  }
  if (chain === 'ETH' || chain === 'USDC' || chain === 'USDT' || chain === 'DAI' || chain === 'BUSD' ||
      chain === 'LINK' || chain === 'UNI' || chain === 'AAVE' || chain === 'MKR' || chain === 'CRV' ||
      chain === 'LDO' || chain === 'SUSHI' || chain === 'SHIB' || chain === 'PEPE' || chain === 'FLOKI' ||
      chain === 'WIF' || chain === 'BONK' || chain === 'GRT' || chain === 'RENDER') {
    const data = await fetchJSON(`https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('etherscan failed');
  }
  if (chain === 'DOGE') {
    const data = await fetchJSON(`https://dogechain.info/api/v1/address/balance/${address}`);
    if (data.balance !== undefined) return parseFloat(data.balance);
    throw new Error('dogechain failed');
  }
  if (chain === 'SOL' || chain === 'JUP') {
    const data = await postJSON('https://api.mainnet-beta.solana.com', {
      jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address]
    });
    if (data.result) return data.result.value / 1e9;
    throw new Error('solana failed');
  }
  if (chain === 'BNB') {
    const data = await fetchJSON(`https://api.bscscan.com/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('bscscan failed');
  }
  if (chain === 'MATIC') {
    const data = await fetchJSON(`https://api.polygonscan.com/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('polygonscan failed');
  }
  if (chain === 'ARB') {
    const data = await fetchJSON(`https://api.arbiscan.io/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('arbiscan failed');
  }
  if (chain === 'OP') {
    const data = await fetchJSON(`https://api-optimistic.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('optimism failed');
  }
  if (chain === 'BASE') {
    const data = await fetchJSON(`https://api.basescan.org/api?module=account&action=balance&address=${address}&tag=latest`);
    if (data.status === '1') return parseInt(data.result) / 1e18;
    throw new Error('basescan failed');
  }
  if (chain === 'XRP') {
    const data = await fetchJSON(`https://api.xrpscan.com/api/v1/account/${address}`);
    if (data.balance) return parseFloat(data.balance);
    throw new Error('xrpscan failed');
  }
  if (chain === 'TRX') {
    const data = await fetchJSON(`https://api.trongrid.io/v1/accounts/${address}`);
    if (data.data && data.data[0]) return data.data[0].balance / 1e6;
    throw new Error('trongrid failed');
  }
  if (chain === 'LTC') {
    const data = await fetchJSON(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`);
    if (data.balance) return data.balance / 1e8;
    throw new Error('blockcypher ltc failed');
  }
  if (chain === 'NEAR') {
    const data = await postJSON('https://rpc.mainnet.near.org', {
      jsonrpc: '2.0', id: 1, method: 'query', params: [address, 'account']
    });
    if (data.result && data.result.amount) return parseInt(data.result.amount) / 1e24;
    throw new Error('near failed');
  }
  if (chain === 'SUI') {
    const data = await postJSON('https://fullnode.mainnet.sui.io:443', {
      jsonrpc: '2.0', id: 1, method: 'suix_getBalance', params: [address]
    });
    if (data.result && data.result.totalBalance) return parseInt(data.result.totalBalance) / 1e9;
    throw new Error('sui failed');
  }
  if (chain === 'ADA') {
    const data = await fetchJSON(`https://api.koios.rest/api/v0/address_info?_address=${address}`);
    if (data[0] && data[0].balance) return parseInt(data[0].balance) / 1e6;
    throw new Error('ada failed');
  }
  return null;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('parse error')); }
      });
    }).on('error', reject);
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const postData = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = client.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('parse error')); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
