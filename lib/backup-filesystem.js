
const fs = require('./fs');

class BackupFileSystem {

	constructor({ fast }) {
		this.root = null;
		this.fast = fast;
	}

	setLocation(root, fstype = 'hash-v1') {
		this.root = root;
		switch(fstype) {
			case 'hash-v2':
				this.hfs = new (require('./hash-filesystem-v2'))({ root });
				break;
			case 'hash-v1':
				this.hfs = new (require('./hash-filesystem-v1'))({ root });
				break;
			default:
				throw new Error('unknown hash filesystem type');
		}
	}

	getLocation() {
		return this.root;
	}

	async put(file, size, hash, variant = 0) {
		let stored = false;
		size = ''+size;
		const key = this.hfs.getKey(hash, variant, size);
		try {
			await this.hfs.access(key);
			this.fast || await fs.compare(bfile, key.path);
		} catch(e) {
			switch (e.code) {
			case 'ENOCOMPARE':
				const h = await fs.hash(file);
				if (h == hash) return this.put(file, size, hash, ++variant);
				throw new Error('file changed while backing up');
			case 'ENOENT':
				await this.hfs.store(file, key);
				stored = true;
				break;
			default:
				throw e;
			}
		}
		return { variant, stored };
	}

	async verify(size, hash, variant, compareWith) {
		const key = this.hfs.getKey(hash, variant, size);
		await this.hfs.access(key);
		const hash2 = await fs.hash(key.path, { hash: 'sha1', encoding: 'hex' });
		if (hash2 != hash) throw new Error(`files.db entry corrupt for ${key.name}/${size}`);
		if (compareWith) await fs.compare(key.path, compareWith);
	}

	async get(hash) {
		// get a file from the backup stor
	}
}

module.exports = BackupFileSystem;
