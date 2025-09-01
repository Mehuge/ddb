#!/usr/bin/env node
const DDB_VERSION = '1.0.0-beta.18';

// A map of command names to their module paths for clarity and easy maintenance.
const commands = {
  backup: './cmd-backup',
  verify: './cmd-verify',
  list: './cmd-list',
  restore: './cmd-restore',
  clean: './cmd-clean',
  server: './cmd-server',
  cat: './cmd-cat',
  rm: './cmd-rm',
};

async function run(args) {
  // The first argument is the command.
  const command = args.shift();

  if (!command || !commands[command]) {
    console.error(`Error: Unknown command "${command}".`);
    console.error(`Available commands: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
  }

  // Handle the shorthand for backup destination.
  if (args[0] && !args[0].startsWith('--')) {
    args.unshift('--dest');
  }

  try {
    const commandModule = require(commands[command]);
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
      console.log(`Available commands: ${Object.keys(commands).join(', ')}`);
      return;
  }
  await run(args);
})();
