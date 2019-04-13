
const { unzip, signature } = require('./fs');

const B_1KB = Math.pow(2,10);
const B_4KB = Math.pow(2,12);
const B_64KB = Math.pow(2,16);
const B_1MB = Math.pow(2,20);

function rdiff_blocksize(size) {
  return size < B_1KB ? B_1KB : size <= B_64KB ? B_4KB : size <= B_1MB ? B_16KB : B_64KB;
}

async function rdiff_signature(source, blocksize = 16384) {
  const reader = typeof source == 'string' ? await unzip(source) : source;
	return await signature(reader, { blockSize: blocksize });
};

module.exports = {
  rdiff_blocksize,
  rdiff_signature,
}
