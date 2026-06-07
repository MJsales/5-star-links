const fs = require('fs');
const d = fs.readFileSync('../pics/logo/logo.ico');
console.log('Size:', d.length);
console.log('Raw bytes 0-20:', d.slice(0, 20).toString('hex'));
console.log('u16 @ 0:', d.readUInt16LE(0));
console.log('u16 @ 2:', d.readUInt16LE(2));
console.log('u16 @ 4:', d.readUInt16LE(4));
console.log('u16 @ 6:', d.readUInt16LE(6));
// Check if this is actually a PNG
console.log('PNG sig?', d.slice(0, 4).toString('hex') === '89504e47');
