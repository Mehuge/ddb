const fs = require('../lib/fs');

function expect(r, e) {
  console.log(r === e ? 'pass' : 'fail');
}

let undefined;

(async function() {
  expect(undefined, await fs.zip('test.js', 'test.js.gz'));
  expect(undefined, await fs.unzip('test.js.gz', 'test.js.unzipped'));
  expect(undefined, await fs.compare('test.js.unzipped', 'test.js'));
  expect(undefined, await fs.compareZipWith('test.js.gz', 'test.js'));
  expect(undefined, await fs.compareZipWith('test.js.gz', 'test.js.unzipped'));
  expect(undefined, await fs.unlink('test.js.gz'));
  expect(undefined, await fs.unlink('test.js.unzipped'));
})();
