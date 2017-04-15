/* eslint yoda: ['error', 'never', { 'exceptRange': true }] */
/* eslint-disable no-bitwise, no-return-assign */

const Long = require('long');
const log = require('../logger');

// Readable
class Readable {
  constructor(buffer, position = 0) {
    this.buffer = buffer;
    this.position = position;
  }

  seek(n) {
    return this.position = n;
  }

  skip(n) {
    return this.position += n;
  }

  bool() {
    const ret = this.byte();
    if (ret > 1) log.warn(new Error('read byte not 0 or 1 for bool'));
    return !!ret;
  }

  byte() {
    return this.buffer[this.position++];
  }

  bytes(n) {
    const slice = this.buffer.slice(this.position, this.position += n);
    return Buffer.from(slice); // make copy
  }

  uint16() {
    const ret = this.buffer.readUInt16LE(this.position);
    this.position += 2;
    return ret;
  }

  uint32() {
    const ret = this.buffer.readUInt32LE(this.position);
    this.position += 4;
    return ret;
  }

  uint64() {
    return new Long(this.int32(), this.int32(), true);
  }

  int16() {
    const ret = this.buffer.readInt16LE(this.position);
    this.position += 2;
    return ret;
  }

  int32() {
    const ret = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return ret;
  }

  int64() {
    return new Long(this.int32(), this.int32(), false);
  }

  float() {
    const ret = this.buffer.readFloatLE(this.position);
    this.position += 4;
    return ret;
  }

  string() {
    let c;
    let ret = '';
    while (c = this.uint16()) { // eslint-disable-line no-cond-assign
      ret += String.fromCharCode(c);
    }
    return ret;
  }
}

// Writeable
class Writeable {
  constructor(length) {
    this.length = length;
    this.buffer = Buffer.alloc(this.length);
    this.position = 0;
  }

  seek(n) {
    return this.position = n;
  }

  skip(n) {
    return this.position += n;
  }

  bool(b = false) {
    if (typeof b !== 'boolean' && b !== 0 && b !== 1) {
      log.warn(new Error('boolean, 0, or 1 was not provided'));
    }

    return this.byte(!!b);
  }

  byte(n = 0) {
    return this.buffer[this.position++] = n;
  }

  bytes(buf) {
    if (!buf) return this.position;
    buf.copy(this.buffer, this.position);
    return this.position += buf.length;
  }

  uint16(n = 0) {
    this.buffer.writeUInt16LE(n, this.position);
    return this.position += 2;
  }

  uint32(n = 0) {
    if (-0x80000000 <= n && n < 0) n >>>= 0; // cast to unsigned
    this.buffer.writeUInt32LE(n, this.position);
    return this.position += 4;
  }

  uint64(obj = {}) {
    if (typeof obj === 'number') {
      if (!Number.isSafeInteger(obj)) {
        log.warn(new Error('unsafe integer was provided'));
      }

      obj = Long.fromNumber(obj, true);
    }

    this.uint32(obj.low);
    return this.uint32(obj.high);
  }

  int16(n = 0) {
    this.buffer.writeInt16LE(n, this.position);
    return this.position += 2;
  }

  int32(n = 0) {
    if (0x80000000 <= n && n <= 0xFFFFFFFF) n |= 0; // cast to signed
    this.buffer.writeInt32LE(n, this.position);
    return this.position += 4;
  }

  int64(obj = {}) {
    if (typeof obj === 'number') {
      if (!Number.isSafeInteger(obj)) {
        log.warn(new Error('unsafe integer was provided'));
      }

      obj = Long.fromNumber(obj, false);
    }

    this.uint32(obj.low);
    return this.int32(obj.high);
  }

  float(n = 0) {
    this.buffer.writeFloatLE(n, this.position);
    return this.position += 4;
  }

  string(str = '') {
    for (const c of str) {
      this.uint16(c.charCodeAt(0)); // charCodeAt ensures <= 0xFFFF
    }
    return this.uint16(0);
  }
}

// exports
module.exports = {
  Readable,
  Writeable,
};
