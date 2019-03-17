const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');
const sqlite3 = require('sqlite3');

class HashFileSystemV2 {
	constructor({ root }) {
		this.root = root;
		this._initFs();
	}

	_initFs() {

	}

	_hash2name(hash, variant = 0) {
		const name = [ hash.substr(0,2), hash.substr(2,3), hash.substr(5,4), ...hash.substr(9).match(/.{1,12}/g) ];
		return name.join(path.sep) + '.' + variant;
	}

	getKey(hash, variant, size) {
		const name = this._hash2name(hash, variant);
		return { hash, variant, size, name, path: path.join(this.root, name, size) };
	}

	async access(key) {
		await fs.access(key.path);
	}

	async store(file, key) {
		await fs.mkdirp(`${this.root}/${key.name}`);
		await fs.copy(file, key.path, FS.COPYFILE_FICLONE);
	}
}

module.exports = HashFileSystemV2;
