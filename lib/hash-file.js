const crypto = require('crypto');
const fs = require('fs');

module.exports = function (filename, opts = {}) {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash(opts.hash||'sha256');
    const fileStream = fs.createReadStream(filename);
    fileStream.on('error', (err) => {
      fileStream.close();
      reject(err);
    });
    fileStream.on('data', function (chunk) {
      try {
        sum.update(chunk);
      } catch (ex) {
        reject(ex);
      }
    });
    fileStream.on('end', function () {
      fileStream.close();
      resolve(sum.digest(opts.encoding||'hex'));
    });
  });
};
