#!/usr/bin/env node
const DDB_VERSION = '1.0.0-beta.12';

async function exec(what, args) {
  if (args[0] && args[0].substr(0,2) != '--') {
    // if first argument after command word is not an option,
    // it is assumed to be a backup destination
    args = [ '--dest', ...args ];
  }
  try {
  	switch(what) {
	case './cmd-backup':  await require('./cmd-backup').exec(args); break;
	case './cmd-verify':  await require('./cmd-verify').exec(args); break;
	case './cmd-list':    await require('./cmd-list').exec(args); break;
	case './cmd-restore': await require('./cmd-restore').exec(args); break;
	case './cmd-clean':   await require('./cmd-clean').exec(args); break;
	case './cmd-server':  await require('./cmd-server').exec(args); break;
	}
  } catch(e) {
    console.dir(e);
  }
}
async function run(args) {
  while (args.length) {
    const arg = args.shift();
    switch(arg) {
      case 'backup':
        await exec('./cmd-backup', args);
        return;
      case 'verify':
        await exec('./cmd-verify', args);
        return;
      case 'list':
        await exec('./cmd-list', args);
        return;
      case 'restore':
        await exec('./cmd-restore', args);
        return;
      case 'clean':
        await exec('./cmd-clean', args);
        return;
      case 'server':
        await exec('./cmd-server', args);
        return;
    }
  }
}

(async () => {
  await run(process.argv);
})();
