
const fs = require('./fs');
const FS = require('fs').constants;
const SEP = require('path').sep;

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

	async writeLogEntry({ type, mode, ctime, mtime, atime, size, hash, variant, path }) {
		await this.log.appendFile(
			`${type} ${mode} ${ctime.toISOString()} ${mtime.toISOString()} ${atime.toISOString()}`
			+ ` ${size|0} ${hash} ${variant} ${JSON.stringify(path)}\n`
		);
	}

	async finishBackupLog(status = 'OK') {
		await this.log.appendFile(`V1 STATUS ${status}\n`);
		await this.log.close();
	}

	async complete(name, ts = new Date()) {
		const from = this.getBackupLog(name, 'running');
		const to = this.getBackupLog(name, ts.toISOString());
		const current = this.getBackupLog(name, 'current');
		await fs.move(from, to)
		await fs.unlink(current);
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
			const fsroot = this.filesystem.getLocation();
			const readline = fs.readline(this.getBackupLog(name, 'running'));
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
};

module.exports = BackupDest;
