const r = require('resedit');
console.log('resedit exports:', Object.keys(r));
if (r.default) console.log('default exports:', Object.keys(r.default));
