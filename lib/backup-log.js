
const fs = require('./fs');

class BackupLog {
	async create(name) {
		this.log = await fs.open(name, 'w', 0o666);
		await this.log.appendFile(`V1 type mode ctime mtime atime size hash path\n`);
	}

	async writeSourceEntry({ root }) {
		await this.log.appendFile(`SOURCE ${root}\n`);
	}

	async writeEntry({ type, mode, ctime, mtime, atime, size, hash, variant, fn }) {
		await this.log.appendFile(
			`${type} ${mode} ${ctime.toISOString()} ${mtime.toISOString()} ${atime.toISOString()}`
			+ ` ${size|0} ${hash} ${variant} ${JSON.stringify(fn)}\n`
		);
	}

	async finish(status = 'OK') {
		await this.log.appendFile(`V1 STATUS ${status}\n`);
		await this.log.close();
	}
}

module.exports = BackupLog;
