const { rcedit } = require('rcedit');
const path = require('path');
const fs = require('fs');

const exePath = path.join(__dirname, '5star-splicer.exe');
const icoPath = path.join(__dirname, '..', 'pics', 'logo', 'logo-new.ico');
const outPath = path.join(__dirname, '5star-splicer-icon.exe');

console.log('Copied exe');
fs.copyFileSync(exePath, outPath);

console.log('Running rcedit...');
rcedit(outPath, { icon: icoPath }).then(() => {
  console.log('Success! Output size:', fs.statSync(outPath).size);
}).catch(err => {
  console.error('Error:', err.message);
  console.log('Output size:', fs.statSync(outPath).size);
});
