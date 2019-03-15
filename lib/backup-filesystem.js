
const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');

const SEP = path.sep;

class BackupFileSystem {

	constructor({ fast }) {
		this.root = null;
		this.fast = fast;
	}

	setLocation(root) {
		this.root = root;
	}

	getLocation() {
		return this.root;
	}

	hash2key(hash, variant = 0) {
		const name = [ hash.substr(0,2), hash.substr(2,3), hash.substr(5,4), ...hash.substr(9).match(/.{1,12}/g) ];
		return {
			hash,
			name: name.join(SEP) + '.' + variant,
		};
	}

	async put(file, size, hash, variant = 0) {
		const key = this.hash2key(hash, variant);
		const bfile = `${this.root}/${key.name}/${size}`;
		let exists;
		try {
			await fs.access(bfile);
			this.fast || await fs.compare(bfile, file);
			exists = true;
		} catch(e) {
			switch (e.code) {
			case 'ENOCOMPARE':
				const h = await fs.hash(file);
				if (h == hash) return this.put(file, size, hash, ++variant);
				throw new Error('file changed while backing up');
			case 'ENOENT':
				await fs.mkdirp(`${this.root}/${key.name}`);
				await fs.copy(file, `${this.root}/${key.name}/${size}`, FS.COPYFILE_FICLONE);
				break;
			default:
				throw e;
			}
		}
		return { variant, exists };
	}

	async verify(size, hash, variant, compareWith) {
		const key = this.hash2key(hash, variant);
		const path = `${this.root}/${key.name}/${size}`;
		await fs.access(path);
		const hash2 = await fs.hash(path, { hash: 'sha1', encoding: 'hex' });
		if (hash2 != hash) throw new Error(`files.db entry corrupt for ${key.name}/${size}`);
		if (compareWith) await fs.compare(path, compareWith);
	}

	async get(hash) {
		// get a file from the backup stor
	}
}

module.exports = BackupFileSystem;
