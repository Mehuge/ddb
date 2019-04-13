
const { rdiff_signature, rdiff_blocksize } = require('./lib/rdiff');
const { unzip } = require('./lib/fs');

function expect(r, e) {
	if (!r) throw new Error(e);
}

const tests = [
	{ dir: 'dd/1f', hash: 'f5896e8d8ccdcb1d26cbf71d25b9ae56e9b88a246f9b0f64da4761f4d2bcce5e', size: 94853 },
	{ dir: 'cc/f8', hash: '197f82ef1366618fd9d47151eb2f29a16ed057f91b661d51bcf1298196c193d2', size: 12922 },
	{ dir: '97/70', hash: 'de9c632086f70104d5e9776a5b53dc800e590d41b5d60f4b5075cee590ebc936', size: 51 },
];

(async function(){
	for (const t of tests) {
		const file = `K:/backups/DDBV4/files.db/${t.dir}/${t.hash}.0.${t.size}`;
		const res = await rdiff_signature(await unzip(file), t.size);
		console.dir(res);
		expect(res.hash == t.hash, 'hash fail');
		expect((res.blocks.length - 1) * rdiff_blocksize(t.size) + res.blocks[res.blocks.length-1].size == t.size, 'incorrect size of blocks');
	}
})();

