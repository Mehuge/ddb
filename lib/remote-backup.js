
const http = require('http');
const { Writable } = require('stream');
const RemoteInstance = require('./remote-instance');

class RemoteBackup {
  constructor({ protocol, hostname, host, port }) {
    this.protocol = protocol;
    this.host = hostname || host;
    this.port = port;
    this.base = `${protocol}://${host}:${port}`;
    this.headers = {};
    this.baseRequest = {
      protocol: this.protocol,
      host: this.host,
      port: this.port,
      headers: {},
    };
  }

  request({ path, options = {}, body, query }) {
    return new Promise((resolve, reject) => {
      if (query) {
        path += '?' + Object.keys(query).map(k => `${k}=${query[k]}`).join('&');
      }
      options = Object.assign({}, this.baseRequest, options, { path });
      if (body) options.method = 'POST';
      console.log(`${options.method||'GET'} ${options.path}`);
      if (body && body.readable) options.body = body;
      const request = http.request(options, res => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ res, body });
        });
        res.on('error', (err) => { body.destroy(); reject(err) });
      });
      request.on('error', reject);
      if (typeof body == 'string') request.write(body);
      request.end();
    });
  }

  async backup({ backupset }) {
    const target = this;
    const instance = this.instance = new RemoteInstance({ target, setname: backupset.setname })
    await instance.createNewInstance();
    return await backupset.backupTo(instance);
  }

  async clean() {
    const { res, body } = await this.request({ path: '/fs/clean', query: { verbose: 1 } });
    if (res.statusCode == 200) {
      if (body) console.log(body);
    }
  }

  async list({ setname, when }) {
    const path = [ '/list' ];
    if (setname) path.push(setname);
    if (when) path.push(when);
    const { res, body } = await this.request({ path: path.join('/'), query: { verbose: 1 } });
    if (res.statusCode == 200) {
      if (body) console.log(body);
    }
  }

  async verify({ setname, when }) {
    const path = [ '/verify' ];
    if (setname) path.push(setname);
    if (when) path.push(when);
    const { res, body } = await this.request({ path: path.join('/'), query: { verbose: 1 } });
    if (res.statusCode == 200) {
      if (body) console.log(body);
    }
  }

  async complete(opts) {
    this.instance.complete(opts);
  }

}

module.exports = RemoteBackup;
