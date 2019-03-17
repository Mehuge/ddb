const { BackupFileSystem, BackupDest, BackupSource, BackupSet, BackupJob } = require('./lib/backup');

const path = require('path');

const NBACKUP_VERSION = '0.1.1-alpha';

(async function() {

	const backupOpts = {
		set: 'default',
		sources: [],
	};

	let i = 1, args = process.argv;
	let source = {};
	while (i < args.length) {
		switch(args[i]) {
		case '--to':
			let to = args[++i];
			if (!path.isAbsolute(to)) to = path.join(process.cwd(), to);
			backupOpts.destination = path.normalize(to);
			break;
		case '--fstype':
			backupOpts.fstype = args[++i];
			break;
		case '--backup':
			backupOpts.backup = true;
			break;
		case '--fast':
			backupOpts.fast = true;
			break;
		case '--verify':
			backupOpts.verify = true;
			break;
		case '--verify-and-compare':
			backupOpts.verify = true;
			backupOpts.compare = true;
			break;
		case '--set-name':
			backupOpts.set = args[++i];
			break;
		case '--from':
			let src = args[++i];
			if (!path.isAbsolute(src)) src = path.join(process.cwd(), src);
			source = { src: path.normalize(src), excludes: [], includes: [] };
			backupOpts.sources.push(source);
			break;
		case '--include':
			source.includes.push(args[++i]);
			break;
		case '--exclude':
			source.excludes.push(args[++i]);
			break;
		case '--verbose':
			backupOpts.verbose = true;
			break;
		case '--clean':
			backupOpts.clean = true;
			break;
		}
		++i;
	}

	// Configure backup from options
	const destination = new BackupDest({
		destination: backupOpts.destination,
		filesystem: new BackupFileSystem({ fast: backupOpts.fast }),
		fstype: backupOpts.fstype,
		verbose: backupOpts.verbose,
	});
	await destination.init(backupOpts.backup);
	const backupset = new BackupSet({
		name: backupOpts.set,
		sources: backupOpts.backup && backupOpts.sources.map
			(source => new BackupSource({
				src: source.src,
				include: source.includes,
				exclude: source.excludes,
				verbose: backupOpts.verbose,
			}))
	});
	const job = new BackupJob({ destination, backupset });

	// Clean backup destination
	if (backupOpts.clean) {
		await await job.clean({ verbose: backupOpts.verbose });
	}

	// Run the backup job
	if (backupOpts.backup) await job.start();

	// If asked to verify, verify
	if (backupOpts.verify) {
		await job.verify({
			compare: backupOpts.compare,
			verbose: backupOpts.verbose,
			variant: backupOpts.backup ? 'running' : 'current'
		});
	}

	// Finally, if backing up, complete the job (bake it)
	if (backupOpts.backup) await job.complete();
})();
