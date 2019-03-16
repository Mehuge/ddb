
const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');
const SEP = path.sep;

const VERSION = 1;

class BackupDest {

	constructor({ destination, filesystem }) {
		if (!destination) throw new Error("Backup destination not supplied");
		if (!filesystem) throw new Error("Backup destination not supplied");
		this.destination = destination;
		this.filesystem = filesystem;
		this.configFile = this.destination + SEP + 'config.json';
		this.filesDb = this.destination + SEP + 'files.db';
		this.backups = this.destination + SEP + 'backups';
		this.filesystem.setLocation(this.filesDb);
	}

	async initConfig() {
		this.config = { version: VERSION };
		await this.saveConfig();
	}

	async saveConfig() {
		this.config.saved = new Date();
		await fs.writeFile(this.configFile, JSON.stringify(this.config, '  '));
	}

	async loadConfig() {
		this.config = JSON.parse(await fs.readFile(this.configFile));
	}

	async init() {

		// Make sure destination exists and is a directory
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

		// load the config
		await this.loadConfig();

		// initialise config if not defined.
		if (!this.config) this.initConfig();
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
		return this.destination + SEP + 'backups' + SEP + name + '.' + type;
	}

	async createBackupLog(name) {
		this.log = await fs.open(this.getBackupLog(name, 'running'), 'w', 0o666);
		await this.log.appendFile(`V1 type mode ctime mtime atime size hash path\n`);
	}

	async writeSetEntry({ root }) {
		await this.log.appendFile(`SET ${root}\n`);
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
			return { type: 'HEADER', version: words[1][1] };
		case 'SET':
			return { type: 'SET', root: line.substr(4) };
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
					case 'SET':
						opts.verbose && console.log(`ROOT ${entry.root}`);
						root = entry.root;
						break;
					case 'F':
						try {
							const compareWith = opts.compare ? root + SEP + entry.path : null;
							await this.filesystem.verify(entry.size, entry.hash, entry.variant, compareWith);
							opts.verbose && console.log(`OK ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
						} catch(e) {
							console.log(`FAIL ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
							console.log(e);
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
					hashes[`${entry.hash}.${entry.variant}`] = entry.size;
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
				case '.current': case '.running': break;
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
				const key = root.substr(s).replace(/\//g,'');
				if (!(key in hashes)) {
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
