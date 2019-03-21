
const NBACKUP_VERSION = '0.1.1-alpha';

async function run(args) {
	while (args.length) {
		switch(args[0]) {
			case 'backup':
				require('./cmd-backup').exec(args);
				return;
			case 'list':
				require('./cmd-list').exec(args);
				return;
			case 'restore':
				require('./cmd-restore').exec(args);
				return;
			case 'clean':
				require('./cmd-clean').exec(args);
				return;
		}
		args.shift();
	}
}

run(process.argv);
