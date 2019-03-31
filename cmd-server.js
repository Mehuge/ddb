const { BackupOptions, BackupTarget } = require('./lib');
const http = require('http');
const url = require('url');

class BackupServer {
  static async exec(args) {
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { destination, fast, verbose } = opts;
    const target = new BackupTarget({ destination, fast, verbose });
    await target.connect(true);

    const port = opts.port || 4444;
    const bind = opts.bind || '0.0.0.0';
    const server = new BackupServer({ target, port, bind });
    await server.run();
  }

  constructor({ target, port, bind }) {
    this.target = target;
    this.port = port;
    this.bind = bind;
  }

  async run() {
    return new Promise((resolve, reject) => {
      const server = this.server = http.createServer(this.handleRequest.bind(this));
      server.listen(this.port, /* this.host, */ (err) => {
        if (err) return reject(err);
        console.log(`TCP Server is running on port ${this.port}`);
      });
    });
  }

  // Backup Service EndPoints
  //
  //  Hash File System
  //   GET /fs/has/<hash>.variant.size
  //      status 200 if exists, 401 if not
  //
  //   POST /fs/put/<hash>.variant.size
  //      {chunked data}
  //      status 200 if put succeeded, 50? if failed
  //
  //   GET /fs/get/<hash>.variant.size
  //      {chunked data}
  //      status 200 if exists, 401 if not
  //
  //   POST /fs/compare/<hash>.n.size
  //      {hash-chain}
  //      status 200 if same, ??? if not
  //
  //   GET /fs/clean
  //      status 200
  //
  //  Instance Management
  //
  //    GET /instance/list?set-name=XXXXX
  //    GET /instance/list?set-name=XXXXX&ts=timestamp
  //    GET /instance/get?set-name=XXXX                 // create new (running) instance
  //    GET /instance/get?set-name=XXXX&ts=timestamp
  //    POST /instance/add-entry
  //    POST /instance/finished

  async handleRequest(request, response) {
    try {
      console.dir(`${request.method} ${request.url}`);
      const uri = url.parse(request.url, true);
      const parts = uri.pathname.split('/').slice(1);
      const target = this.target;
      let setname, when, verbose;
      switch(parts.shift()) {
        case 'fs':
          switch(parts.shift()) {
            case 'has':
              const key = parts.shift().split('.');
              const has = await target.fs().has(key[2], key[0], key[1]);
              response.writeHead(has ? 200 : 404);
              response.end();
              return;
            case 'clean':
              await this.target.clean();
              response.writeHead(200);
              response.end();
              return;
          }
          break;
        case 'verify':
          setname = parts.shift();
          when = parts.shift() || 'current';
          verbose = "verbose" in uri.query;
          response.writeHead(200, { 'Content-Type': 'text/plain' });
          await this.target.verify({ setname, when, verbose, log: (s) => {
            response.write(s+'\n');
          }});
          response.end();
          return;
        case 'list':
          setname = parts.shift();
          when = parts.shift();
          const filter = {};
          response.writeHead(200, { 'Content-Type': 'text/plain' });
          await this.target.list({ setname, when, filter, log: (s) => {
            response.write(s+'\n');
          }});
          response.end();
          break;
      }
      response.writeHead(400);
      response.end();
    } catch(e) {
      response.writeHead(503, e.toString());
      response.end();
    }
  }
}

module.exports = BackupServer;
