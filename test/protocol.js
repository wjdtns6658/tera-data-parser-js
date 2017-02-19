const { test } = require('tap');
const sinon = require('sinon');

// we have to be careful with this because the object stores state,
// and we can't just re-require because node caches modules
const protocol = require('../lib/protocol');

test('load', (t) => {
  const warn = sinon.spy(console, 'warn');

  t.throws(() => protocol.load('invalid-directory'),
    /ENOENT: no such file or directory/,
    'should throw if basePath points to invalid tera-data');

  t.ok(protocol.load(), 'should load default tera-data (from devDependencies)');

  // .map:
  // TODO: malformed line
  // TODO: non-numeric opcode

  // .def:
  // TODO: malformed line
  // TODO: array nesting too deep

  // TODO: unmapped message

  console.warn.restore();

  t.end();
});

test('parse', (t) => {
  // TODO

  t.end();
});

test('write', (t) => {
  // TODO

  t.end();
});
