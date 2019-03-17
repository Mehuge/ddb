
class BackupSet {
	constructor({ name, sources }) {
		if (!name) throw new Error("backup set must have a name");
		this.name = name;
		this.sources = sources || [];
		this.started = null;
		this.stats = {
			skipped: 0,
			folders: 0,
			files: 0,
			bytes: 0,
			backedUp: {
				files: 0,
				bytes: 0,
			},
		};
	}

	addSource(source) {
		this.sources.push(source);
	}

	getSources() {
		return this.sources;
	}

	async backupTo(destination) {
		await destination.createBackupLog(this.name);
		this.started = new Date();
		const sources = this.sources;
		for (let i = 0; i < sources.length; i++) {
			await sources[i].backupTo(destination, this.stats);
		}
		await destination.finishBackupLog('OK ' + JSON.stringify(this.stats));
	}

	async complete(destination) {
		await destination.complete(this.name, this.started);
		this.displayStats();
	}

	displayStats() {
		const { skipped, folders, files, bytes, backedUp } = this.stats
		console.log(`Backup ${this.name} complete.`);
		console.log(`Processed: ${files} files (${((bytes+1023)/1024/1024)|0} MB) ${folders} folders. Skipped ${skipped}.`);
		console.log(`Backed up: ${backedUp.files} files (${((backedUp.bytes+1023)/1024/1024)|0} MB)`);
	}

	getStats() {
		return this.stats;
	}
};

module.exports = BackupSet;
