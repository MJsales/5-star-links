const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function main() {
  const pngPath = path.join(__dirname, '..', 'pics', 'logo', 'logo.png.png');
  const icoPath = path.join(__dirname, '..', 'pics', 'logo', 'logo-new.ico');

  console.log('Converting PNG to ICO...');
  console.log('Input:', pngPath, 'exists:', fs.existsSync(pngPath));

  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  console.log('Written ICO:', icoPath, 'size:', buf.length);

  // Verify
  const d = fs.readFileSync(icoPath);
  console.log('Verify - Size:', d.length);
  console.log('Verify - u16 @ 4 (count):', d.readUInt16LE(4));
}

main().catch(e => console.error('Error:', e));
