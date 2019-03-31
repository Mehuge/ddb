
const http = require('http');
const { URL } = require('url');

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
  async request({ path, options = {}, body, query }) {
    return new Promise((resolve, reject) => {
      if (query) {
        path += '?' + Object.keys(query).map(k => `${k}=${query[k]}`).join('&');
      }
      options = Object.assign({}, this.baseRequest, options, { path });
      const request = http.request(options, res => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ res, body }));
      });
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });
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

}

module.exports = RemoteBackup;
