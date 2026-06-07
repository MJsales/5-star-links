const sharp = require('sharp');
const path = require('path');

async function main() {
  const src = path.join(__dirname, '..', 'pics', 'logo', 'logo.png.png');
  const dst = path.join(__dirname, 'launcher', 'winres', 'app.png');
  
  console.log('Resizing to 256x256...');
  await sharp(src)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dst);
  
  console.log('Done:', dst);
}

main().catch(e => console.error('Error:', e));
