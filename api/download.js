const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fileId = 'A7kvd0';
  const fileName = '5star-launcher.exe';

  try {
    // Step 1: Get gofile content info
    const tokenRes = await fetch('https://api.gofile.io/createAccount');
    const tokenData = await tokenRes.json();
    const token = tokenData.data.token;

    const contentRes = await fetch(`https://api.gofile.io/contents/${fileId}?token=${token}`);
    const contentData = await contentRes.json();

    if (contentData.status !== 'ok' || !contentData.data) {
      return res.status(502).json({ error: 'Could not get file info from gofile' });
    }

    const contents = contentData.data.children || contentData.data;
    let downloadUrl;

    if (Array.isArray(contents)) {
      downloadUrl = contents[0]?.link;
    } else if (contents.link) {
      downloadUrl = contents.link;
    } else {
      const firstKey = Object.keys(contents)[0];
      downloadUrl = contents[firstKey]?.link;
    }

    if (!downloadUrl) {
      return res.status(502).json({ error: 'No download link found' });
    }

    // Step 2: Stream the file
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch file' });
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = fileRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const reader = fileRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
      }
    };
    await pump();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};
