const crypto = require('crypto');
const fs = require('fs');

module.exports = function (source, opts = {}) {
  const encoding = opts.encoding || 'hex';
  const highWaterMark = opts.chunkSize || 16384;
  const blockSize = opts.blockSize || highWaterMark;
  const signature = opts.signature;
  let blockSum = crypto.createHash(opts.blockHash||'sha1');
  let blocks = 0;
  let blockLen = 0;
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash(opts.hash||'sha256');
    const fileStream = typeof source == 'string' ? fs.createReadStream(source, { highWaterMark }) : source;
    fileStream.on('error', (err) => {
      stream || fileStream.close();
      reject(err);
    });
    fileStream.on('data', function (chunk) {
      try {
        sum.update(chunk);
        if (signature) {
          blockLen += chunk.length;
          if (blockLen >= blockSize) {
            const l = chunk.length - (blockLen - blockSize);
            blockSum.update(l == chunk.length ? chunk : chunk.slice(0,l));
            signature(blocks, blocks * blockSize, blockSize, blockSum.digest(encoding));
            ++blocks;
            blockSum = crypto.createHash(opts.signatureHash||'sha1');
            blockLen = chunk.length - l;
            if (blockLen > 0) {
              console.log(`overflow length ${blockLen}`);
              blockSum.update(chunk.slice(slice));
            }
          } else {
            blockSum.update(chunk);
          }
        }
      } catch (ex) {
        reject(ex);
      }
    });
    fileStream.on('end', function (chunk) {
      if (signature && blockLen) {
        signature(blocks, blocks * blockSize, blockLen, blockSum.digest(encoding));
      }
      typeof source == 'string' && fileStream.close();
      resolve(sum.digest(encoding));
    });
  });
};
