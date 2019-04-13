
const { rdiff_signature, rdiff_blocksize } = require('./lib/rdiff');

function expect(r, e) {
	if (!r) throw new Error(e);
}

const filehash = '196fac31d83e6b5f4bb24600672b308cf5282761c9918e4eff42d1ecf2e16a8b';
const size = 3738050;
const file = `01/3b/${filehash}.0.${size}`;

(async function(){
	const zipFile = `K:/backups/CUBE-DDB/files.db/${file}`;
	const res = await rdiff_signature(zipFile, rdiff_blocksize(size));
	expect(res.hash == filehash, 'hash fail');
	expect(res.blocks.length == 58, 'incorrect number of blocks');
  console.dir(res);
})();

