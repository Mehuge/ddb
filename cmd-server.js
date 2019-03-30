const { BackupOptions, BackupDest, BackupFileSystem } = require('./lib');
const http = require('http');

class BackupServer {
  static async exec(args) {
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const destination = new BackupDest({
      destination: opts.destination,
      filesystem: new BackupFileSystem({ fast: opts.fast }),
      verbose: opts.verbose,
    });
    await destination.init(false);

    const port = opts.port || 4444;
    const bind = opts.bind || '0.0.0.0';
    const server = new BackupServer({ destination, port, bind });
    await server.run();
  }

  constructor({ destination, port, bind }) {
    this.destination = destination;
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
      const parts = request.url.split('?');
      const path = parts.shift().split('/').slice(1);
      const query = parts.join('?').split('&');
      switch(path[0]) {
        case 'fs':
          switch(path[1]) {
            case 'has':
              const key = path[2].split('.');
              const has = await this.destination.fs().has(key[2], key[0], key[1]);
              response.writeHead(has ? 200 : 404);
              response.end();
              return;
            case 'clean':
              await this.destination.clean();
              response.writeHead(200);
              response.end();
              return;
          }
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
