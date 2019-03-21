const { BackupFileSystem, BackupDest, BackupSource, BackupSet, BackupJob, BackupOptions } = require('./lib/backup');

class Backup {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions({
			set: 'default',
			sources: [],
			backup: true,
		})).parse(args);

		// Configure backup from options
		const destination = new BackupDest({
			destination: opts.destination,
			filesystem: new BackupFileSystem({ fast: opts.fast }),
			fstype: opts.fstype,
			verbose: opts.verbose,
		});
		await destination.init(opts.backup);

		// Clean backup destination
		if (opts.clean) {
			await destination.clean(opts);
		}

		// Setup backup set
		const backupset = new BackupSet({
			name: opts.set,
			sources: opts.backup && opts.sources.map
				(source => new BackupSource({
					src: source.src,
					include: source.includes,
					exclude: source.excludes,
					verbose: opts.verbose,
				}))
		});

		// Create backup job
		const job = new BackupJob({ destination, backupset });

		// Run the backup job
		if (opts.backup) await job.backup();

		// If asked to verify, verify
		if (opts.verify) {
			await job.verify({
				compare: opts.compare,
				verbose: opts.verbose,
				variant: opts.backup ? 'running' : 'current'
			});
		}

		// Finally, if backing up, complete the job (bake it)
		if (opts.backup) await job.complete();
	}
};

module.exports = Backup;
