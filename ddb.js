#!/usr/bin/env node
const DDB_VERSION = '1.0.0-beta.19';

// A map of command names to their module paths for clarity and easy maintenance.
const commands = {
  backup: () => require('./cmd-backup'),
  verify: () => require('./cmd-verify'),
  list:   () => require('./cmd-list'),
  restore:() => require('./cmd-restore'),
  clean:  () => require('./cmd-clean'),
  server: () => require('./cmd-server'),
  cat:    () => require('./cmd-cat'),
  rm:     () => require('./cmd-rm'),
};

async function run(args) {
  // The first argument is the command.
  const command = args.shift();

  // Handle the shorthand for backup destination.
  if (args[0] && !args[0].startsWith('--')) {
    args.unshift('--dest');
  }

  try {
    const commandModule = commands[command]();
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
