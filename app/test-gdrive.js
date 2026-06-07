const https = require('https');

https.get('https://drive.google.com/uc?export=download&id=1jzKrEk6aAfDq7RXDOIeUH-DXmZRBPiUQ', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, (r) => {
  let body = '';
  r.on('data', c => body += c);
  r.on('end', () => {
    console.log('Response length:', body.length);
    console.log('Has form:', body.includes('download-form'));
    
    // Try different regex patterns
    const patterns = [
      /name="confirm"\s+value="([^"]+)"/,
      /name=confirm\s+value=([^&"]+)/,
      /confirm=([0-9A-Za-z_-]+)/,
      /value="t"/
    ];
    for (const p of patterns) {
      const m = body.match(p);
      console.log(p.toString(), '->', m ? m[1] : 'NO MATCH');
    }
    
    // Show the relevant form section
    const formStart = body.indexOf('download-form');
    if (formStart > -1) {
      console.log('\nForm HTML:', body.substring(formStart - 20, formStart + 500));
    } else {
      console.log('\nNo form found. First 500 chars:', body.substring(0, 500));
    }
  });
});
