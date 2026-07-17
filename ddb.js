#!/usr/bin/env node
const DDB_VERSION = '1.0.0-beta.19';

function requireCommand(command) {
  switch(command) {
    case 'backup':
      return require('./cmd-backup');
    case 'verify':
      return require('./cmd-verify');
    case 'list':
      return require('./cmd-list');
    case 'restore':
      return require('./cmd-restore');
    case 'clean':
      return require('./cmd-clean');
    case 'server':
      return require('./cmd-server');
    case 'cat':
      return require('./cmd-cat');
    case 'rm':
      return require('./cmd-rm');
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function run(args) {
  // The first argument is the command.
  const command = args.shift();

  // Handle the shorthand for backup destination.
  if (args[0] && !args[0].startsWith('--')) {
    args.unshift('--dest');
  }

  try {
    const commandModule = requireCommand(command);
    await commandModule.exec(args);
  } catch (e) {
    // Provide more user-friendly error output.
    console.error(`An error occurred while running the "${command}" command:`);
    console.error(e.message);
    process.exit(1);
  }
}

(async () => {
  // Use slice(2) to ignore 'node' and the script path.
  const args = process.argv.slice(2);
  if (args.length === 0) {
      console.log(`ddb version ${DDB_VERSION}`);
      console.log('Usage: ddb <command> [options]');
      return;
  }
  await run(args);
})();
