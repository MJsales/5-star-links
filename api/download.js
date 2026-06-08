const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    // Step 1: Create guest account
    const accountRes = await httpsPost('https://api.gofile.io/accounts');
    const account = JSON.parse(accountRes.data);
    const token = account.data.guestToken;

    // Step 2: Get content info
    const contentId = '6dS5zK';
    const contentRes = await httpsGet(`https://api.gofile.io/contents/${contentId}`, { 'Authorization': `Bearer ${token}` });
    const content = JSON.parse(contentRes.data);

    if (content.status === 'ok') {
      const files = content.data.files;
      const fileId = Object.keys(files)[0];
      const downloadLink = files[fileId].link;

      // Step 3: Redirect to actual download
      res.writeHead(302, {
        'Location': downloadLink,
        'Content-Disposition': 'attachment; filename="5star-launcher.exe"'
      });
      res.end();
    } else {
      res.writeHead(302, { 'Location': 'https://gofile.io/d/6dS5zK' });
      res.end();
    }
  } catch (e) {
    res.writeHead(302, { 'Location': 'https://gofile.io/d/6dS5zK' });
    res.end();
  }
};
