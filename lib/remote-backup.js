
const http = require('http');
const { Readable } = require('stream');
const RemoteInstance = require('./remote-instance');

class RemoteBackup {
  constructor({ protocol, hostname, host, port, verbose }) {
    this.protocol = protocol;
    this.host = hostname || host;
    this.port = port;
    this.verbose = verbose;
    this.base = `${protocol}://${host}:${port}`;
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 1,
      keepAliveMsecs: 3000
    });
    this.baseRequest = {
      agent: this.agent,
      protocol: this.protocol,
      host: this.host,
      port: this.port,
    };
  }

  request({ path, options = {}, body, query }) {
    return new Promise((resolve, reject) => {
      if (query) {
        path += '?' + Object.keys(query).map(k => `${k}=${query[k]}`).join('&');
      }
      options = Object.assign({}, this.baseRequest, options, { path });
      if (body) options.method = 'POST';
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
      if (!body) {
        request.end();
        return;
      }
      if (body instanceof Readable && body.readable) {
        body.pipe(request);
        body.on('error', reject);
        body.on('end', () => request.end());
      } else if (typeof body == 'string') {
        request.write(body);
        request.end();
      } else {
        request.setHeader('Content-Type', 'text/json');
        request.write(JSON.stringify(body));
        request.end();
      }
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
    const { res, body } = await this.request({ path: path.join('/'), query: { verbose: this.verbose ? 1 : 0 } });
    if (res.statusCode == 200 && this.verbose) {
      console.log('Backup Verified');
      if (body) console.log(body);
    }
  }

  async complete({ backupset }) {
    await backupset.complete();
    this.agent.destroy();
  }

}

module.exports = RemoteBackup;
