const path = require('path');

class BackupOptions {
  constructor(options = {}) {
    this.options = options;
    options.filter = { includes: [], excludes: [] };
  }
  parse(args) {
    const opts = this.options;
    let source;
    while (args.length) {
      const arg = args[0].split('=');
      args.shift();
      switch(arg[0]) {
      case 'backup':
        opts.backup = true;
        break;
      case 'restore':
        opts.restore = true;
        break;
      case 'list':
        opts.list = true;
        break;
      case 'verfiy':
        opts.verify = true;
        break;
      case '--to': case '--dest':
        let to = arg[1] || args.shift();
        if (!path.isAbsolute(to)) to = path.join(process.cwd(), to);
        opts.destination = path.normalize(to);
        break;
      case '--fstype':
        opts.fstype = arg[1] || args.shift();
        break;
      case '--no-backup':
        opts.backup = false;
        break;
      case '--fast':
        opts.fast = true;
        break;
      case '--verify':
        opts.verify = true;
        break;
      case '--verify-and-compare':
        opts.verify = true;
        opts.compare = true;
        break;
      case '--set-name':
        opts.set = arg[1] || args.shift();
        break;
      case '--from':
        let src = arg[1] || args.shift();
        if (!path.isAbsolute(src)) src = path.join(process.cwd(), src);
        opts.sources.push(source = { src: path.normalize(src), excludes: [], includes: [] });
        break;
      case '--include':
        (source ? source : opts.filter).includes.push(arg[1] || args.shift());
        break;
      case '--exclude':
        (source ? source : opts.filter).excludes.push(arg[1] || args.shift());
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--clean':
        opts.clean = true;
        break;
      case '--older-than':
        opts.olderThan = arg[1] || args.shift();
        break;
      case '--when': case '--instance':
        opts.when = arg[1] || args.shift();
        break;
      case '--since':
        opts.since = new Date(arg[1] || args.shift());
        break;
      }
    }
    return opts;
  }
  get() {
    return this.options;
  }
}

module.exports = BackupOptions;
