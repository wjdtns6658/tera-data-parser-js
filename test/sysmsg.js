const { test } = require('tap');
const path = require('path');

// we have to be careful with this because the object stores state,
// and we can't just re-require because node caches modules
const sysmsg = require('../lib/sysmsg');

// helper functions
function getTestDataPath(dir) {
  return path.join(__dirname, 'fixtures', dir);
}

// tests
test('load', (t) => {
  t.throws(
    () => sysmsg.load('invalid-directory'),
    /ENOENT: no such file or directory/,
    'should throw if basePath points to invalid tera-data'
  );

  // devDependencies should have installed tera-data
  t.ok(sysmsg.load(), 'should default load tera-data from node_modules');

  const ok = t.ok(
    sysmsg.load(getTestDataPath('sysmsg')),
    'should load tera-data from specified path'
  );

  if (!ok) t.bailout('cannot load custom tera-data paths for testing');

  t.ok(sysmsg.maps.has(1), 'should load sysmsg map version');

  t.same(
    sysmsg.maps.get(1).name.get('SMT_TEST'),
    1,
    'should save name in mapping'
  );

  t.same(
    sysmsg.maps.get(1).code.get(1),
    'SMT_TEST',
    'should save code in mapping'
  );

  t.end();
});
