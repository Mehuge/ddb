const path = require('path');

class BackupOptions {
  constructor(options = {}) {
    this.options = options;
    options.filter = { subdirs:[], filters: [] };
  }
  parse(args) {
    const opts = this.options;
    let source;
    while (args.length) {
      const arg = args[0].split('=');
      args.shift();
      switch(arg[0]) {

      /* ************** */
      /* common options */
      /* ************** */

      case '--to': case '--dest':
        let to = arg[1] || args.shift();
        if (to.substr(0,5) == 'http:' || to.substr(0,6) == 'https:') {
          opts.destination = to;
          opts.client = true;
        } else {
          if (!path.isAbsolute(to)) to = path.join(process.cwd(), to);
          opts.destination = path.normalize(to);
        }
        break;
      case '--access-key':
        // for use on a client, maps to a userid
        opts.accessKey = arg[1] || args.shift();
        break;
      case '--userid':
        // for use on the server, if want to list, verify or restore a users
        // backups, specify the userid.
        opts.userid = arg[1] || args.shift();
        break;
      case '--verify':
        opts.verify = true;
        break;
      case '--compare':             // compare implies verify
      case '--verify-and-compare':
        opts.verify = true;
        opts.compare = true;
        break;
      case '--set-name': case '--setname':
        opts.setname = arg[1] || args.shift();
        break;
      case '--from': case '--source':
        let src = arg[1] || args.shift();
        if (!path.isAbsolute(src)) src = path.join(process.cwd(), src);
        opts.sources.push(source = { src: path.normalize(src), subdirs: [], filters: [] });
        break;
      case '--include':
        (source ? source : opts.filter).filters.push(`+${arg[1] || args.shift()}`);
        break;
      case '--exclude':
        (source ? source : opts.filter).filters.push(`-${arg[1] || args.shift()}`);
        break;
      case '--subdir':
        (source ? source : opts.filter).subdirs.push(arg[1] || args.shift());
        break;
      case '--deep-scan':
        opts.deepscan = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--older-than':
        opts.olderThan = arg[1] || args.shift();
        break;
      case '--when': case '--instance':                 /* list & restore */
        opts.when = arg[1] || args.shift();
        break;
      case '--current':
        opts.when = 'current';
        break;

      /* ************** */
      /* backup options */
      /* ************** */

      case '--fstype':
        opts.fstype = arg[1] || args.shift();
        break;
      case '--no-backup':
        opts.backup = false;
        break;
      case '--fast':
        opts.fast = true;
        break;
      case '--clean':
        opts.clean = true;
        break;

      /* ************ */
      /* list options */
      /* ************ */

      case '--sources':
        opts.sources = true;
        break;
      case '--since':
        opts.since = new Date(arg[1] || args.shift());
        break;

      /* *************** */
      /* restore options */
      /* *************** */

      case '--compare-with':
        let compareWith = arg[1] || args.shift();
        if (!path.isAbsolute(compareWith)) compareWith = path.join(process.cwd(), output);
        opts.compareWith = compareWith;
        break;

      /* *************** */
      /* restore options */
      /* *************** */

      case '--output':                              // restore --output where to write files (overrides --from)
        let output = arg[1] || args.shift();
        if (!path.isAbsolute(output)) output = path.join(process.cwd(), output);
        opts.output = path.normalize(output);
        break;
      case '--force':                              // restore --output where to write files (overrides --from)
        opts.force = true;
        break;


      /* *************** */
      /* server options */
      /* *************** */
      case '--bind':
        opts.bind = (arg[1] || args.shift());
        break;
      case '--port':
        opts.port = (arg[1] || args.shift()) | 0;
        break;
      case '--http':
        opts.https = false;
        break;
      case '--https':
        opts.https = true;
        break;
      case '--cert':
        opts.cert = arg[1] || args.shift();
        opts.https = true;
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
