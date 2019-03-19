
const fs = require('./fs');
const path = require('path');

const VERSION = 1;

class BackupDest {

	constructor({ destination, filesystem, fstype }) {
		if (!destination) throw new Error("Backup destination not supplied");
		if (!filesystem) throw new Error("Backup destination not supplied");
		this.destination = destination;
		this.filesystem = filesystem;
		this.fstype = fstype || 'hash-v1';
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

	toString() {
		return "BackupDest: " + this.destination;
	}

	fs() {
		return this.filesystem;
	}

	getBackupLog(name, type) {
		return path.join(this.destination, 'backups', name + '.' + type);
	}

	async createBackupLog(name) {
		this.log = await fs.open(this.getBackupLog(name, 'running'), 'w', 0o666);
		await this.log.appendFile(`V1 type mode ctime mtime atime size hash path\n`);
	}

	async writeSourceEntry({ root }) {
		await this.log.appendFile(`SOURCE ${root}\n`);
	}

	async writeLogEntry({ type, mode, ctime, mtime, atime, size, hash, variant, fn }) {
		await this.log.appendFile(
			`${type} ${mode} ${ctime.toISOString()} ${mtime.toISOString()} ${atime.toISOString()}`
			+ ` ${size|0} ${hash} ${variant} ${JSON.stringify(fn)}\n`
		);
	}

	async finishBackupLog(status = 'OK') {
		await this.log.appendFile(`V1 STATUS ${status}\n`);
		await this.log.close();
	}

	async complete(name, ts = new Date()) {
		const from = this.getBackupLog(name, 'running');
		const to = this.getBackupLog(name, ts.toISOString().replace(/[\-:]/g,''));
		const current = this.getBackupLog(name, 'current');
		await fs.move(from, to)
		try {
			await fs.access(current);
			await fs.unlink(current);
		} catch(e) {
			if (e.code != 'ENOENT') throw e;
		}
		await fs.link(to, current);
	}

	parseV1(line) {
		const words = line.split(' ');
		switch(words[0]) {
		case 'V1':
			return { type: 'HEADER', version: words[0][1] };
		case 'SOURCE': case 'SET': /* temp */
			return { type: 'SOURCE', root: line.substr(words[0].length+1) };
		case 'D': case 'F':
			const key = ` ${words[6]} ${words[7]} `;
			const path = JSON.parse(line.substr(line.indexOf(key) + key.length));
			return {
				type: words[0],
				mode: words[1],
				ctime: words[2],
				mtime: words[3],
				atime: words[4],
				size: words[5],
				hash: words[6],
				variant: words[7],
				path,
			};
		}
		return { type: 'unknown', line: line };
	}

	async verify(name, opts = {}) {
		return new Promise((resolve, reject) => {
			let root;
			const lines = [];
			const readline = fs.readline(this.getBackupLog(name, opts.variant));
			readline.on('line', line => lines.push(this.parseV1(line)));
			readline.on('error', reject);
			readline.on('close', async () => {
				for (let i = 0; i < lines.length; i++) {
					const entry = lines[i];
					switch (entry.type) {
					case 'SOURCE':
						opts.verbose && console.log(`SOURCE ${entry.root}`);
						root = entry.root;
						break;
					case 'F':
						try {
							const compareWith = opts.compare ? path.join(root, entry.path) : null;
							await this.filesystem.verify(entry.size, entry.hash, entry.variant, compareWith);
							opts.verbose && console.log(`OK ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
						} catch(e) {
							if (e.code == 'ENOCOMPARE') {
								console.log(`CHANGED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
							} else if (e.code == 'ENOENT') {
								console.log(`DELETED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
							} else {
								throw e;
							}
						}
						break;
					}
				}
				resolve();
			});
		});
	}

	async _scanLog(path, hashes) {
		return new Promise((resolve, reject) => {
			const readline = fs.readline(path);
			readline.on('line', line => {
				const entry = this.parseV1(line);
				if (entry.type == 'F') {
					hashes[`${entry.hash}.${entry.variant}.${entry.size}`] = 1;
				}
			});
			readline.on('close', resolve);
		});
	}

	async _getActiveHashes() {
		const hashes = {};
		const dir = await fs.readdir(this.backups, { withFileTypes: true });
		for (let i = 0; i < dir.length; i++) {
            const entry = dir[i];
			if (entry.isFile()) {
				const ext = path.extname(entry.name);
				const name = path.basename(entry.name, ext);
				switch (ext) {
				case '.current': break;
				case '.running':
					throw new Error("can't clean when a backup is running");
					break;
				default:
					await this._scanLog(path.join(this.backups, entry.name), hashes);
					break;
				}
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
		const hashes = await this._getActiveHashes();
		await this._removeObsolete(this.filesDb, hashes);
	}
};

module.exports = BackupDest;
