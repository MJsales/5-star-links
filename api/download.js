const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(data);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const contentCode = 'A7kvd0';
  const fileName = '5star-launcher.exe';

  try {
    // Step 1: Create guest account to get token
    const tokenRes = await httpsPost('https://api.gofile.io/accounts', {});
    const tokenData = JSON.parse(tokenRes.body);
    if (tokenData.status !== 'ok') {
      return res.status(502).json({ error: 'Failed to get token', raw: tokenRes.body });
    }
    const token = tokenData.data.token;

    // Step 2: Get content info
    const contentUrl = `https://api.gofile.io/contents/${contentCode}?token=${token}`;
    const contentRes = await httpsGet(contentUrl);

    let contentData;
    try {
      contentData = JSON.parse(contentRes.body);
    } catch (e) {
      return res.status(502).json({ error: 'Invalid JSON from gofile', raw: contentRes.body.substring(0, 500) });
    }

    if (contentData.status !== 'ok') {
      return res.status(502).json({ error: 'Content not found', detail: contentData });
    }

    // Find the file
    let downloadUrl;
    const children = contentData.data.children;
    if (children) {
      const keys = Object.keys(children);
      for (const key of keys) {
        if (children[key].link) {
          downloadUrl = children[key].link;
          break;
        }
      }
    }

    if (!downloadUrl) {
      return res.status(502).json({ error: 'No download link', content: contentData.data });
    }

    // Step 3: Stream file to user
    const fileRes = await new Promise((resolve, reject) => {
      https.get(downloadUrl, {
        headers: { 'Cookie': `accountToken=${token}` }
      }, (r) => resolve(r)).on('error', reject);
    });

    // Follow redirect
    if (fileRes.statusCode >= 300 && fileRes.statusCode < 400 && fileRes.headers.location) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Location', fileRes.headers.location);
      return res.redirect(fileRes.headers.location);
    }

    const ct = fileRes.headers['content-type'] || 'application/octet-stream';
    const cl = fileRes.headers['content-length'];

    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (cl) res.setHeader('Content-Length', cl);

    fileRes.pipe(res);

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};
