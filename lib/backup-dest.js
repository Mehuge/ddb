
const fs = require('./fs');
const path = require('path');
const BackupInstance = require('./backup-instance');

const VERSION = 1;
class BackupDest {

	constructor({ destination, filesystem, fstype }) {
		if (!destination) throw new Error("Backup destination not supplied");
		if (!filesystem) throw new Error("Backup destination not supplied");
		this.destination = destination;
		this.filesystem = filesystem;
		this.fstype = fstype || 'hash-v3';
		this.configFile = path.join(this.destination, 'config.json');
		this.filesDb = path.join(this.destination, 'files.db');
		this.backups = path.join(this.destination, 'backups');
	}

	async initConfig() {
		this.config = { version: VERSION, fstype: this.fstype };
		await this.saveConfig();
	}

	async saveConfig() {
		this.config.saved = new Date();
		await fs.writeFile(this.configFile, JSON.stringify(this.config, '  '));
	}

	async loadConfig() {
		this.config = JSON.parse(await fs.readFile(this.configFile));
	}

	async init(create) {

		// if writing to the destination need to make sure it exists
		if (create) {
			try {
				const stats = await fs.stat(this.destination);
				if (!stats.isDirectory()) throw new Error('destination not a directory');
			} catch(e) {
				if (e.code == 'ENOENT') await fs.mkdirp(this.destination);
				else throw e;
			}

			// If directory is not initialised, initialise it
			await fs.mkdirp(this.filesDb);
			await fs.mkdirp(this.backups);

			// Create config if it doesn't exist
			try {
				await fs.access(this.configFile);
			} catch(e) {
				if (e.code == 'ENOENT') {
					this.initConfig();
				} else {
					throw e;
				}
			}
		}

		if (!this.config) {
			// load the config
			await this.loadConfig();
		}

		// tell the filesystem where it is
		await this.filesystem.setLocation(this.filesDb, this.config.fstype);
	}

	getConfig() {
		return this.config;
	}

	getPath() {
		return this.destination;
	}

	toString() {
		return "BackupDest: " + this.destination;
	}

	fs() {
		return this.filesystem;
	}

	async getLogs(set = null) {
		const logs = [];
		for (const log of await fs.readdir(this.backups, { withFileTypes: true })) {
			if (log.isFile()) {
				if (!set || set == path.basename(log.name, path.extname(log.name))) {
					logs.push(log);
				}
			}
		}
		return logs;
	}

	async getAllActiveHashes() {
		const hashes = {};
		for (const log of await this.getLogs()) {
			const ext = path.extname(log.name);
			switch (ext) {
			case '.current': break;		// ignore, just a link to newest entry
			case '.running':
				throw new Error("can't when a backup is running");
				break;
			default:
				const name = path.basename(log.name, ext);
				const instance = new BackupInstance({ destination: this, name })
				await instance.getHashesFromInstanceLog(ext.substr(1), hashes);
				break;
			}
		}
		return hashes;
	}

	async _removeEntry(fn) {
		const l = this.filesDb.length;
		await fs.unlink(fn);
		fn = path.dirname(fn);
		do {
			try {
				await fs.rmdir(fn);
			} catch(e) {
				if (e.code == 'ENOTEMPTY') return;
				throw e;
			}
			fn = path.dirname(fn);
		} while (fn.length > l);
	}

	async _removeObsolete(root, hashes) {
		const dir = await fs.readdir(root, { withFileTypes: true });
		const s = this.filesDb.length + 1;
		for (let i = 0; i < dir.length; i++) {
			const entry = dir[i];
			if (entry.isDirectory()) {
				await this._removeObsolete(path.join(root, entry.name), hashes);
			} else if (entry.isFile()) {
				const key = this.filesystem.keyFromFile(root.substr(s), entry.name);
				if (key && !(key in hashes)) {
					console.log('REMOVE ' + key);
					await this._removeEntry(path.join(root, entry.name));
				}
			}
		}
	}

	async clean(opts = {}) {
		const hashes = await this.getAllActiveHashes();
		await this._removeObsolete(this.filesDb, hashes);
	}
};

module.exports = BackupDest;
