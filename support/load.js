'use strict';
const path = require('node:path');

module.exports = function load(...files) {
  for (const f of files) require(path.join(__dirname, '..', 'src', f));
  return globalThis[Symbol.for('inkdom-timers')];
};
