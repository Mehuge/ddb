
const fs = require('./fs');
const SEP = require('path').sep;

class BackupSource {
	constructor({ src, include, exclude, verbose }) {
		this.src = src;
		if (!src) throw new Error("source path missing");
		this.include = include;
		this.exclude = exclude;
		this.verbose = verbose;
	}

	async backupTo(destination, stats) {
		await destination.writeSetEntry({ root: this.src });
		await this._backupDir(this.src, destination, stats);
	}

	async _log(destination, type, path, stats, hash = '-', variant = 0) {
		if (this.verbose) console.log(this.src + SEP + path);
		const { mode, ctime, mtime, atime, size } = stats;
		await destination.writeLogEntry({ type, mode, ctime, mtime, atime, size, hash, variant, path });
	}

	async _backupDir(path, destination, stats) {
		try {
			const fstat = await fs.stat(path);
			await this._log(destination, 'D', path.substr(this.src.length+1), fstat);
		} catch(e) {
			if (e.code == 'ENOENT') {
				console.log(`${path} is missing`);
				stats.skipped++;
				return;
			}
			throw e;
		}
		stats.folders ++;
		const dir = await fs.readdir(path, { withFileTypes: true });
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
				switch(type) {
				case 'D':
					await this._backupDir(path + SEP + entry.name, destination, stats);
					break;
				case 'F':
					await this._backupFile(path + SEP + entry.name, destination, stats);
					break;
				default:
					// ignore other types
					break;
				}
			} else {
				console.log(`${dir.name} unknown file type`);
			}
		}
	}

	async _backupFile(path, destination, stats) {
		try { 
			const fstat = await fs.stat(path);
			const hash = await fs.hash(path, { hash: 'sha1', encoding: 'hex' });
			stats.files ++;
			stats.bytes += fstat.size;
			const { variant, exists } = await destination.fs().put(path, fstat.size, hash);
			await this._log(destination, 'F', path.substr(this.src.length+1), fstat, hash, variant);
			if (!exists) {
				stats.backedUp.files ++;
				stats.backedUp.bytes += fstat.size;
			}
		} catch(e) {
			stats.skipped ++;
			console.log(`${path} failed`);
			console.dir(e);
			throw e;
		}
	}
};

module.exports = BackupSource;
