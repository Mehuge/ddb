
class LogParser {

    parseToHashMap(lines) {
        this._map = lines.filter(line => line.type == 'F').reduce((map, line) => (
            (map[line.hash] || (map[line.hash] = line)), map
        ), {});
        return this._map;
    }

    getHashMap() {
        return this._map;
    }

    hasHash(hash) {
        return this.getHash() != undefined;
    }

    getHash(hash) {
        return this._map[hash];
    }
}

module.exports = LogParser;