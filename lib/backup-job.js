
class BackupJob {
	constructor({ destination, backupset }) {
		if (!destination) throw new Error("destination missing");
		this.destination = destination;
		this.backupset = backupset;
	}
	async start() {
		await this.backupset.backupTo(this.destination);
	}
	async verify(opts) {
		await this.destination.verify(this.backupset.name, opts);
	}
	async clean() {
		await this.destination.clean(opts);
	}
	async complete() {
		await this.backupset.complete(this.destination);
	}
}

module.exports = BackupJob;
