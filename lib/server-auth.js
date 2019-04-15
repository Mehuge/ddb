
const crypto = require('crypto');

// GET /auth/login/key

class LoginState {
  constructor({ at, token, key, secret, address }) {
    this.token = token;
    this.at = at;
    this.key = key;
    this.secret = secret;
    this.address = address;
    this.touch();
  }
  logout() {
  }
  touch() {
    this.touched = new Date();
  }
  expire(after) {
    const then = this.touched.valueOf();
    const now = Date.now();
    return now - then > (after*1000);
  }
}

class Auth {
  constructor() {
    this.tokens = {};
  }
  async process({ parts, request, response }) {
    let token;
    switch(parts.shift()) {
      case 'login':
        const key = parts.shift();
        const at = new Date();
        const sha1 = crypto.createHash('sha1');
        const address = request.socket.remoteAddress;
        const secret = `${at.toISOString()}:${key}:${request.socket.remoteAddress}`;
        sha1.update(secret);
        token = sha1.digest('hex');
        this.tokens[token] = new LoginState({ at, token, key, secret, address });
        response.writeHead(200, token);
        response.end();
        return;
      case 'logout':
        token = (request.headers['authorization']||'').split(' ');
        if (token[0] == 'token') {
          token = token[1];
          const state = this.tokens[token];
          if (state) {
            state.logout();
            delete this.tokens[token];
            response.writeHead(200);
          } else {
            response.writeHead(401, 'not logged in');
          }
        } else {
            response.writeHead(403, 'not allowed');
        }
        response.end();
        return;
    }
  }
  removeToken(token) {
    delete this.tokens[token];
  }
  authenticate({ address, token }) {
    token = this.tokens[token];
    if (token && token.address == address) {
      token.touch();
      return true;
    }
  }
  expire({ after }) {
    if (this.tokens) {
      for (let token in this.tokens) {
        if (this.tokens[token].expire(after || 900)) {
          this.removeToken(token);
        }
      }
    }
  }
};

module.exports = new Auth();
