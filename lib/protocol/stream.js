const Long = require('long');

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

  byte() {
    return this.buffer[this.position++];
  }

  bytes(n) {
    return this.buffer.slice(this.position, this.position += n);
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
    let c, ret = '';
    while (c = this.uint16()) {
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

  byte(n) {
    return this.buffer[this.position++] = n;
  }

  bytes(buf) {
    buf.copy(this.buffer, this.position);
    return this.position += buf.length;
  }

  uint16(n) {
    this.buffer.writeUInt16LE(n, this.position);
    return this.position += 2;
  }

  uint32(n) {
    if (-0x80000000 <= n && n < 0) n >>>= 0; // cast to unsigned
    this.buffer.writeUInt32LE(n, this.position);
    return this.position += 4;
  }

  uint64(obj) {
    if (typeof obj === 'number') {
      if (!Number.isSafeInteger(obj)) {
        console.warn(new Error('unsafe integer was provided'));
      }

      obj = Long.fromNumber(obj, true);
    }

    this.uint32(obj.low);
    return this.uint32(obj.high);
  }

  int16(n) {
    this.buffer.writeInt16LE(n, this.position);
    return this.position += 2;
  }

  int32(n) {
    if (0x80000000 <= n && n <= 0xFFFFFFFF) n |= 0; // cast to signed
    this.buffer.writeInt32LE(n, this.position);
    return this.position += 4;
  }

  int64(obj) {
    if (typeof obj === 'number') {
      if (!Number.isSafeInteger(obj)) {
        console.warn(new Error('unsafe integer was provided'));
      }

      obj = Long.fromNumber(obj, false);
    }

    this.uint32(obj.low);
    return this.int32(obj.high);
  }

  float(n) {
    this.buffer.writeFloatLE(n, this.position);
    return this.position += 4;
  }

  string(str) {
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
