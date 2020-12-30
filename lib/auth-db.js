const fs = require('./fs');
const ip = require('ip');

module.exports = class {
  constructor({ fn }) {
    this.fn = fn;
  }
  async load() {
    try {
      await fs.access(this.fn);
      this.auth = require(this.fn);
    } catch(e) {
      this.auth = null;
    }
  }
  exists() {
    return this.auth != null;
  }
  authenticate({ key, address }) {
    if (!this.auth) return;     // no auth-database, not authenticated
    const account = this.auth.keys[key];
    if (!account) return;       // invalid access key, not authenticated
    const allow = account.allow;
    if (allow && allow.length) {
      for (let i = 0; i < allow.length; i++) {
        let subnet = allow[i];
        if (subnet.indexOf('/') == -1) subnet += '/32';
        if (ip.cidrSubnet(subnet).contains(address)) {
          return account;       // authenticated
        }
      }
    }
    // ip checks failed, not authenticated
  }
}
