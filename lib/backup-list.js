
const path = require('path');
const BackupInstance = require('./backup-instance');

class BackupList {
	constructor({ destination }) {
		if (!destination) throw new Error("destination missing");
		this.destination = destination;
	}

	ext2iso(ext) {
		return `${ext.substr(0,4)}-${ext.substr(4,2)}-${ext.substr(6,2)}`
					+ `T${ext.substr(9,2)}:${ext.substr(11,2)}:${ext.substr(13,2)}`
					+ `.${ext.substr(15)}`;
	}

	async getStats(name, when) {
		const instance = new BackupInstance({ destination: this.destination, name });
		const lines = await instance.getLinesFromInstanceLog(when);
		return lines.pop().stats;
	}

	async list(set) {
		for (const log of await this.destination.getLogs(set)) {
			const ext = path.extname(log.name)
			const name = log.name.substr(0, log.name.length - ext.length);
			if (name != set) {
				console.log(`Backup Set: ${name}`)
				set = name;
			}
			switch(ext) {
				case '.current': case '.running': break;
				default:
					const when = `${this.ext2iso(ext.substr(1))}`;
					const stats = await this.getStats(name, ext.substr(1));
					console.log(`${when} ${stats.files} files ${((stats.bytes*100/1024/1024)|0)/100} MB took ${stats.took/1000} seconds`);
					break;
			}
		}
	}
}

module.exports = BackupList;
