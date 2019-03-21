const { BackupFileSystem, BackupDest, BackupSource, BackupSet, BackupList, BackupOptions } = require('./lib/backup');

class List {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions()).parse(args);

		// Configure backup from options
		const destination = new BackupDest({
			destination: opts.destination,
			filesystem: new BackupFileSystem({ fast: opts.fast }),
			fstype: opts.fstype,
			verbose: opts.verbose,
		});
		await destination.init(false);

		// Create backup job
		const job = new BackupList({ destination });
		job.list(opts.set);
	}
};

module.exports = List;
