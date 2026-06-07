const sharp = require('sharp');
const path = require('path');

async function main() {
  const src = path.join(__dirname, '..', 'pics', 'logo', 'logo.png.png');
  const meta = await sharp(src).metadata();
  console.log('PNG:', meta.width, 'x', meta.height, meta.format, 'channels:', meta.channels);

  // Generate multiple sizes for ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const s of sizes) {
    const buf = await sharp(src).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    buffers.push(buf);
  }

  // Build ICO manually
  const count = sizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + count * dirEntrySize;

  let dataOffset = dirSize;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const buf = buffers[i];
    entries.push({ w: s, h: s, data: buf, offset: dataOffset });
    dataOffset += buf.length;
  }

  // ICO header
  const ico = Buffer.alloc(dataOffset);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type = ICO
  ico.writeUInt16LE(count, 4); // count

  // Dir entries
  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const off = headerSize + i * dirEntrySize;
    ico.writeUInt8(e.w >= 256 ? 0 : e.w, off + 0); // width
    ico.writeUInt8(e.h >= 256 ? 0 : e.h, off + 1); // height
    ico.writeUInt8(0, off + 2); // color palette
    ico.writeUInt8(0, off + 3); // reserved
    ico.writeUInt16LE(1, off + 4); // color planes
    ico.writeUInt16LE(32, off + 6); // bits per pixel
    ico.writeUInt32LE(e.data.length, off + 8); // data size
    ico.writeUInt32LE(e.offset, off + 12); // data offset
  }

  // Copy image data
  for (const e of entries) {
    e.data.copy(ico, e.offset);
  }

  const outPath = path.join(__dirname, 'launcher', 'winres', 'app.ico');
  require('fs').writeFileSync(outPath, ico);
  console.log('Created ICO:', outPath, 'size:', ico.length, 'entries:', count);
}

main().catch(e => console.error(e));
