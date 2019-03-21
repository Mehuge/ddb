class Filter {
  constructor({ includes, excludes }) {
    this.includes = includes ? [...includes] : [];
    this.excludes = excludes ? [...excludes] : [];
    this._init();
  }
  _init() {
    function re(p) {
      const re = '^' + p
          .replace(/\*\*/g, '{STARSTARGLOB}')
          .replace(/[.]/g,'\.')
          .replace(/[/\\]/g,'[/\\\\]')
          .replace(/\*/g, '[^/\\\\]*')
          .replace(/{STARSTARGLOB}/g, '.*');
      console.log(`${p} = /${re}/`);
      return new RegExp(re);
    }
    this.includes = this.includes.map(re);
    this.excludes = this.excludes.map(re);
  }
  ignores(str) {
    let ignored = false;
    for (const exclude of this.excludes) {
      if (exclude.test(str)) {
        ignored = true;
      }
    }
    for (const include of this.includes) {
      if (include.test(str)) {
        ignored = false;
      }
    }
    return ignored;
  }
}

module.exports = Filter;
