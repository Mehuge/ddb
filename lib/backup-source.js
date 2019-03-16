
const fs = require('./fs');
const path = require('path');
const SEP = path.sep;
const ignore = require('ignore');

class BackupSource {
	constructor({ src, include, exclude, verbose }) {
		this.src = src;
		if (!src) throw new Error("source path missing");
		this.include = include;
		this.exclude = exclude;
		this.verbose = verbose;
		this.ignore = null;
	}

	async backupTo(destination, stats) {
		await destination.writeSetEntry({ root: this.src });
		await this._backupDir(this.src, destination, stats);
	}

	async _log(destination, type, fn, stats, hash = '-', variant = 0) {
		if (this.verbose) console.log(path.join(this.src, fn));
		const { mode, ctime, mtime, atime, size } = stats;
		await destination.writeLogEntry({ type, mode, ctime, mtime, atime, size, hash, variant, fn });
	}

	_initFilter() {
		const exclude = this.exclude;
		if (!this.ignore && exclude) {
			this.ignore = ignore();
			const ignores = [ ...exclude ];
			const include = this.include;
			if (include) {
				ignores.concat(include.map(pattern => `!${pattern}`));
			}
			this.ignore.add(ignores);
		}
		return this.ignore;
	}

	_checkExcluded(fn) {
		const exclude = this.exclude;
		if (exclude) {
			const ignore = this._initFilter();
			if (ignore.ignores(fn)) {
				return true;
			}
		}
	}

	async _backupDir(dirname, destination, stats) {
		try {
			const fstat = await fs.stat(dirname);
			await this._log(destination, 'D', dirname.substr(this.src.length+1), fstat);
		} catch(e) {
			if (e.code == 'ENOENT') {
				console.log(`${dirname} is missing`);
				stats.skipped++;
				return;
			}
			throw e;
		}
		stats.folders ++;
		const dir = await fs.readdir(dirname, { withFileTypes: true });
		const l = this.src.length+1;
		for (let i = 0; i < dir.length; i++) {
			const entry = dir[i];
			let type;
			if (entry.isFile()) type = 'F';
			if (entry.isDirectory()) type = 'D';
			if (entry.isBlockDevice()) type = 'B';
			if (entry.isCharacterDevice()) type = 'C';
			if (entry.isFIFO()) type = 'P';
			if (entry.isSocket()) type = 'S';
			if (entry.isSymbolicLink()) type = 'L';
			if (type) {
				const fn = path.join(dirname, entry.name);
				if (!this._checkExcluded(fn.substr(l))) {
					switch(type) {
					case 'D':
						await this._backupDir(fn, destination, stats);
						break;
					case 'F':
						await this._backupFile(fn, destination, stats);
						break;
					default:
						// ignore other types
						break;
					}
				}
			} else {
				console.log(`${dir.name} unknown file type`);
			}
		}
	}

	async _backupFile(fn, destination, stats) {
		try {
			const fstat = await fs.stat(fn);
			const hash = await fs.hash(fn, { hash: 'sha1', encoding: 'hex' });
			stats.files ++;
			stats.bytes += fstat.size;
			const { variant, stored } = await destination.fs().put(fn, fstat.size, hash);
			await this._log(destination, 'F', fn.substr(this.src.length+1), fstat, hash, variant);
			if (stored) {
				stats.backedUp.files ++;
				stats.backedUp.bytes += fstat.size;
			}
		} catch(e) {
			stats.skipped ++;
			console.log(`${fn} failed`);
			console.dir(e);
			throw e;
		}
	}
};

module.exports = BackupSource;
