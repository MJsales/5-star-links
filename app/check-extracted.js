const fs = require('fs');
const d = fs.readFileSync('winres/APP_0000.ico');
console.log('Size:', d.length);
console.log('u16 @ 0 (reserved):', d.readUInt16LE(0));
console.log('u16 @ 2 (type):', d.readUInt16LE(2));
console.log('u16 @ 4 (count):', d.readUInt16LE(4));
console.log('First 20 bytes:', d.slice(0, 20).toString('hex'));
