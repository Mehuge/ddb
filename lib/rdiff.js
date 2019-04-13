
const { signature } = require('./fs');
const { createReadStream } = require('fs');
const { Writable } = require('stream');

const B_1KB = Math.pow(2,10);
const B_4KB = Math.pow(2,12);
const B_16KB = Math.pow(2,14);
const B_64KB = Math.pow(2,16);
const B_1MB = Math.pow(2,20);

function rdiff_blocksize(size) {
  return size <= B_1KB ? B_1KB : size <= B_64KB ? B_4KB : size <= B_1MB ? B_16KB : B_64KB;
}

async function rdiff_signature(reader, size) {
	return await signature(reader, { size, blockSize: rdiff_blocksize(size) });
};

async function rdiff(fn, size, oldsig) {
  return new Promise(async (resolve, reject) => {
    const blockSize = rdiff_blocksize(size);
    const newsig = await signature(fn, { blockSize, size });
    let i = 0;
    const rdiff = [];

    // diff the two files, generate rdiff script
    let last;
    for (const block of newsig.blocks) {
      const old = oldsig.blocks[i];
      if (old && old.size == block.size && old.sum == block.sum) {
        if (last && last.type == 'C') {
          last.size += block.size;
        } else {
          rdiff.push(last = { type: 'C', offset: i * blockSize, size: block.size });
        }
      } else {
        if (last && last.type == 'D') {
          last.size += block.size;
        } else {
          rdiff.push(last = { type: 'D', offset: i * blockSize, size: block.size });
        }
      }
      ++i;
    }
    resolve(rdiff);
  });
}

// todo wip
async function rdiff_stream(fn, script, oldhash) {
  const writer = new Writeable();
  const file = await fs.open(fn,'r');
  writer.write(`F ${oldhash}`);
  for (const cmd of script) {
    writer.write(`${cmd.type} ${cmd.offset} ${cmd.length}`);
    switch(cmd.type) {
      case 'D':
        const buffer = new Buffer();
        const bytes = await fs.read(file, buffer, 0, cmd.size, cmd.offset);
        break;
    }
  }
}

module.exports = {
  rdiff_blocksize,
  rdiff_signature,
  rdiff,
}
