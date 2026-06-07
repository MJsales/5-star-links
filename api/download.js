const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { id, name } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing file id' });
  }

  const driveUrl = `https://drive.google.com/uc?export=download&id=${id}`;

  try {
    const follow = (url) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          follow(response.headers.location);
          return;
        }

        const fileName = name || 'download';
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (response.headers['content-length']) {
          res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.pipe(res);
      }).on('error', (e) => {
        res.status(500).json({ error: e.message });
      });
    };

    follow(driveUrl);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
