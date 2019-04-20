const URL = require('url');
const LocalBackup = require('./local-backup');
const RemoteBackup = require('./remote-backup');

class BackupTarget {
  constructor({ destination, fstype, fast, verify, verbose, accessKey }) {
    this._destination = destination;
    this._fstype = fstype;
    this._fast = fast;
    this._verify = verify;
    this._verbose = verbose;
    this._accessKey = accessKey;
  }
  async connect(create) {
    const destination = this._destination;
    if (destination.substr(0,5) == 'http:' || destination.substr(0,6) == 'https:') {
      await this._connectRemote();
    } else {
      await this._connectLocal(create);
    }
  }
  async _connectLocal(create) {
    const destination = this._destination;
    const fstype = this._fstype;
    const fast = this._fast;
    const verify = this._verify;
    this._target = new LocalBackup({ destination, fstype, fast, verify });
    await this._target.connect(create);
  }
  async _connectRemote() {
    const verbose = this._verbose;
    const { protocol, hostname, port } = URL.parse(this._destination);
    this._target = new RemoteBackup({ protocol, hostname, port, verbose });
  }

  target() {
    return this._target;
  }

  isRemote() {
    return this._target instanceof RemoteBackup;
  }

  async clean() {
    return await this._target.clean();
  }

  async getLogs(setname, instance, userid) {
    return await this._target.getLogs(setname, instance, userid);
  }

  getPath() {
    return this._target.getPath();
  }

  fs() {
    return this._target.fs();
  }

  async list(opts) {
    return await this._target.list(opts);
  }

  async backup(opts) {
    return await this._target.backup(opts);
  }

  async verify(opts) {
    return await this._target.verify(opts);
  }

  async complete(opts) {
    return await this._target.complete(opts);
  }

  async restore(opts) {
    const { output, force } = opts;
    if (!output && !force) {
      throw new Error('cowardly refusing to restore backup over source, use either --output or --force');
    }
    return await this._target.restore(opts);
  }

  async login() {
    if (this.isRemote() && this._accessKey) {
      await this._target.login({ accessKey: this._accessKey });
    }
  }

  async logout() {
    if (this.isRemote()) {
      await this._target.logout();
    }
  }

  destroy() {
    this._target.destroy();
  }
}

module.exports = BackupTarget;
