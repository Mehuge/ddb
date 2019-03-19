const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class HashFileSystemV2 {
	constructor({ root }) {
		this.root = root;
		this.indexFile = path.join(root, 'index.db');
	}

	async _openDb() {
		return new Promise((resolve, reject) => {
			const flags = sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE;
			const db = this.db = new sqlite3.Database(this.indexFile, flags, (err) => {
				if (err) reject(err);
				db.run('CREATE TABLE IF NOT EXISTS hashes (hash text, size int, variant int, bucket int)');
				db.run('CREATE TABLE IF NOT EXISTS buckets (bucket text, count int)');
				resolve(this.indexDb);
			});
		});
	}

	async initFs() {
		await this._openDb();
	}

	async _hash2bucket(hash, size, variant) {
		return new Promise((resolve, reject) => {
			this.db.get(`SELECT bucket FROM hashes WHERE hash = ? AND size = ? AND variant = ?`,
				[ hash, size, variant ],
				(err, row) => {
					if (err) reject(err);
					resolve(row ? row['bucket'] : null);
				}
			);
		});
	}

	async _addHash(key, bucketSize = 10000) {
		return new Promise((resolve, reject) => {
			this.db.get('SELECT bucket FROM buckets WHERE count < ?', [ bucketSize ], (err, row) => {
				let bucket;
				if (err) reject(err);
				if (!row) {
					bucket = Date.now().toString().match(/.{1,9}/g).join(path.sep);
					this.db.run('INSERT INTO buckets VALUES (?, 1)', [ bucket ], (err) => {
						if (err) reject(err);
					});
				} else {
					bucket = row['bucket'];
					this.db.run('UPDATE buckets SET count = count + 1 WHERE bucket = ?', [ bucket ], (err) => {
						if (err) reject(err);
					});
				}
				this.db.run('INSERT INTO hashes VALUES (?, ?, ?, ?)', [ key.hash, key.size, key.variant, bucket ], (err) => {
					if (err) reject(err);
					key.bucket = bucket;
					const name = path.join('buckets', bucket, `${key.hash}.${key.variant}.${key.size}`);
					resolve(Object.assign({}, key, { name, path: path.join(this.root, name) }));
				});
			});
		})
	}

	async getKey(hash, variant, size) {
		const bucket = await this._hash2bucket(hash, size, variant)
		if (!bucket) return { hash, variant, size };
		const name = path.join('buckets', bucket, `${hash}.${variant}.${size}`);
		return { hash, variant, size, name, path: path.join(this.root, name) };
	}

	async exists(key) {
		return !!key.path;
	}

	async store(file, key) {
		key = await this._addHash(key);
		await fs.mkdirp(path.join(this.root, 'buckets', key.bucket));
		await fs.copy(file, key.path, FS.COPYFILE_FICLONE);
	}

	keyFromFile(dir, name) {
		if (name == 'index.db') return;
		return name;
	}
}

module.exports = HashFileSystemV2;
