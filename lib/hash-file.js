const crypto = require('crypto');
const fs = require('fs');

module.exports = function ({ filename, stream }, opts = {}) {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash(opts.hash||'sha256');
    const fileStream = stream || fs.createReadStream(filename);
    fileStream.on('error', (err) => {
      stream || fileStream.close();
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
      stream || fileStream.close();
      resolve(sum.digest(opts.encoding||'hex'));
    });
  });
};
