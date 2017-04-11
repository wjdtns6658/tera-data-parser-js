function c(method) {
  // eslint-disable-next-line no-console
  return (...args) => console[method](...args);
}

try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  module.exports = require('baldera-logger')('tera-data-parser');
} catch (err) {
  module.exports = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: c('warn'),
    error: c('error'),
    fatal: c('error'),
  };
}
