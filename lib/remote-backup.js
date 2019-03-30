
const http = require('http');
const { URL } = require('url');

class RemoteBackup {
  constructor({ host, port }) {
    this.host = host;
    this.port = port;
    this.base = `http://${host}:${port}`;
    this.headers = {};
    this.baseRequest = {
      host: this.host,
      port: this.port,
      headers: {},

    };
  }
  async request({ path, options }) {
    return new Promise((resolve, reject) => {
      http.request(Object.assign({}, this.baseRequest, options, { path }), res => {
        const body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ res, body }));
      });
    });
  }
  async clean() {
    const { res, body } = await this.request({ path: '/fs/clean' });
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    console.log(`BODY: ${body}`);
  }
}

module.exports = RemoteBackup;
