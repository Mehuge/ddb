const fs = require('./fs');
const net = require('net');

module.exports = class {
  constructor({ fn }) {
    this.fn = fn;
    this.auth = null;
  }
  async load() {
    this.auth = null;
    try {
      const data = await fs.readFile(this.fn, 'utf8');
      if (data === null) return;
      this.auth = JSON.parse(data);
    } catch(e) {
    }
  }
  exists() {
    return this.auth != null;
  }
  authenticate({ key, address }) {
    if (!this.auth || !this.auth.keys) return;     // no auth-database, not authenticated

    const account = this.auth.keys[key];
    if (!account) return;       // invalid access key, not authenticated

    const allow = account.allow;
    if (!allow || !allow.length) return;

    if (allow.includes(address)) return account;

    const checker = new net.BlockList();
    let hasSubnet = false;

    for (const entry of allow) {
      if (entry.includes('/')) {
        const [range, bits] = subnet.split('/');
        checker.addSubnet(range, parseInt(bits || 32, 10));
        hasSubnet = true;
      }
    }

    if (hasSubnet && checker.check(address)) return account;
    return;     // ip checks failed, not authenticated
  }
}