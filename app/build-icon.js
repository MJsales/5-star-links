const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const appDir = path.join(os.tmpdir(), 'splicer-caxa-build');
const inputDir = path.join(__dirname);
const outputPath = path.join(inputDir, '5star-splicer.exe');

// Clean up old build dir
if (fs.existsSync(appDir)) {
  fs.rmSync(appDir, { recursive: true, force: true });
}

// Create build directory
fs.mkdirSync(appDir, { recursive: true });

// Copy splicer.js and package.json
fs.copyFileSync(path.join(inputDir, 'splicer.js'), path.join(appDir, 'splicer.js'));
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: '5star-splicer',
  version: '1.0.0',
  main: 'splicer.js'
}));

// Copy node_modules from project root
console.log('Copying dependencies...');
const nodeModulesSrc = path.join(inputDir, 'node_modules');
if (fs.existsSync(nodeModulesSrc)) {
  execSync(`xcopy "${nodeModulesSrc}" "${path.join(appDir, 'node_modules')}" /E /I /Q`, { stdio: 'inherit' });
}

// Copy the node.exe from the pkg output for reference
const nodePath = path.join(inputDir, 'node_modules', '.bin');

console.log('Building with caxa...');
try {
  execSync(`caxa --input "${appDir}" --output "${outputPath}" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/splicer.js"`, {
    stdio: 'inherit',
    cwd: inputDir
  });
  console.log('Done! Output:', outputPath);
} catch (e) {
  console.error('caxa failed:', e.message);
}
