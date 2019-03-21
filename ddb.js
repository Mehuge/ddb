
const NBACKUP_VERSION = '0.1.1-alpha';

async function run(args) {
  while (args.length) {
    switch(args[0]) {
      case 'backup':
        await require('./cmd-backup').exec(args);
        return;
      case 'list':
        await require('./cmd-list').exec(args);
        return;
      case 'restore':
        await require('./cmd-restore').exec(args);
        return;
      case 'clean':
        await require('./cmd-clean').exec(args);
        return;
    }
    args.shift();
  }
}

run(process.argv);
