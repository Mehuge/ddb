
const NBACKUP_VERSION = '0.1.1-alpha';

async function exec(what, args) {
  if (args[0] && args[0].substr(0,2) != '--') {
    // if first argument after command word is not an option,
    // it is assumed to be a backup destination
    args = [ '--dest', ...args ];
  }
  try {
    await require(what).exec(args);
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
    }
    args.shift();
  }
}

run(process.argv);