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
          if (blockLen + chunk.length >= blockSize) {
            while (chunk.length >= blockSize) {
              blockSum.update(chunk.slice(0,blockSize));
              signature(blocks, blocks * blockSize, blockSize, blockSum.digest(encoding));
              ++blocks;
              chunk = chunk.slice(blockSize);
              blockSum = crypto.createHash(opts.signatureHash||'sha1');
            }
            blockLen += chunk.length;
            if (chunk.length > 0) {
              blockSum.update(chunk);
              if (blockLen == blockSize) {
                signature(blocks, blocks * blockSize, blockSize, blockSum.digest(encoding));
                ++blocks;
                blockSum = crypto.createHash(opts.signatureHash||'sha1');
                blockLen = 0;
              }
            }
          } else {
            blockSum.update(chunk);
            blockLen += chunk.length;
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
