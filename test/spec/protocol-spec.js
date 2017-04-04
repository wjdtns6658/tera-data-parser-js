const Long = require('long');

function roundFloatFromBuffer(float) {
  const buf = Buffer.allocUnsafe(4);
  buf.writeFloatLE(float, 0);
  return buf.readFloatLE(0);
}

module.exports = {
  both: [
    {
      it: 'should use latest version for "*"',
      args: ['TEST_VERSIONS', '*'],
      buffer: Buffer.from('060000000200', 'hex'),
      object: { int16: 2 },
    },

    {
      it: 'should use latest version if version not specified',
      args: ['TEST_VERSIONS'],
      buffer: Buffer.from('060000000200', 'hex'),
      object: { int16: 2 },
    },

    {
      it: 'should use the specified definition version',
      args: ['TEST_VERSIONS', 1],
      buffer: Buffer.from('0500000001', 'hex'),
      object: { byte: 1 },
    },

    {
      it: 'should correctly handle simple types',
      args: ['TEST_SIMPLE', 1],
      buffer: Buffer.from('1600010001020300040000000500060000009a99f940', 'hex'),
      object: {
        bool: true,
        byte: 2,
        int16: 3,
        int32: 4,
        uint16: 5,
        uint32: 6,
        float: roundFloatFromBuffer(7.8),
      },
    },

    {
      it: 'should correctly handle arrays',
      args: ['TEST_ARRAY', 1],
      buffer: Buffer.from('3f000500020014000200260001003a000000000014001d0001000000021d0000000300000004260030002c0035000000300000003600360000003a00000001', 'hex'),
      object: {
        arr: [
          { int: 1, byte: 2 },
          { int: 3, byte: 4 },
        ],
        arr2: [
          { str: '5' },
          { str: '6' },
        ],
        arr3: [
          { ok: true },
        ],
        arr4: [],
      },
    },

    {
      it: 'should correctly handle "bytes" type',
      args: ['TEST_BYTES', 1],
      buffer: Buffer.from('180004000c000800140004000102030405060708fffefdfc', 'hex'),
      object: {
        buf1: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
        buf2: Buffer.from([255, 254, 253, 252]),
      },
    },

    {
      it: 'should correctly handle 64-bit integers',
      args: ['TEST_LONG', 1],
      buffer: Buffer.from('1400020001000000020000000300000004000000', 'hex'),
      object: {
        long: new Long(1, 2, false),
        ulong: new Long(3, 4, true),
      },
    },

    {
      it: 'should correctly handle strings',
      args: ['TEST_STRING', 1],
      buffer: Buffer.from('1c00030008000a00000053007400720069006e006700200032000000', 'hex'),
      object: {
        string1: '',
        string2: 'String 2',
      },
    },

    {
      it: 'should correctly handle simple objects',
      args: ['TEST_OBJECT_SIMPLE', 1],
      buffer: Buffer.from('090006000100000002', 'hex'),
      object: {
        obj: {
          int: 1,
          byte: 2,
        },
      },
    },

    {
      it: 'should correctly handle complex objects',
      args: ['TEST_OBJECT_COMPLEX', 1],
      buffer: Buffer.from('3200070012000200160022000200260001003200000016001c0003001c00000004003500000026002c0006002c0000000700', 'hex'),
      object: {
        int: 1,
        obj: {
          str: '2',
          arr: [
            { int: 3 },
            { int: 4 },
          ],
        },
        str: '5',
        arr: [
          { int: 6 },
          { int: 7 },
        ],
      },
    },

    {
      it: 'should correctly handle nested objects',
      args: ['TEST_OBJECT_NESTED', 1],
      buffer: Buffer.from('9400080002000c0002004c000c002c0002001400140020001c000100320000002000000028000300340000002c00000002003400340040003c000500360000004000000048000700380000004c00700002005400540062005c000900310030000000620000006a000b0031003200000070000000020078007800860080000d00310034000000860000008e000f00310036000000', 'hex'),
      object: {
        obj: {
          arr: [
            {
              obj: {
                arr: [
                  { int: 1, str: '2' },
                  { int: 3, str: '4' },
                ],
              },
            },
            {
              obj: {
                arr: [
                  { int: 5, str: '6' },
                  { int: 7, str: '8' },
                ],
              },
            },
          ],
        },
        arr: [
          {
            obj: {
              arr: [
                { obj: { int: 9, str: '10' } },
                { obj: { int: 11, str: '12' } },
              ],
            },
          },
          {
            obj: {
              arr: [
                { obj: { int: 13, str: '14' } },
                { obj: { int: 15, str: '16' } },
              ],
            },
          },
        ],
      },
    },

    {
      it: 'should correctly handle a definition containing all types',
      args: ['TEST_ALL', 1],
      buffer: Buffer.from('ce00e8030200380054000400580002005e00010203000400000006000000050000000700080000000a0000000900000085eb31410d000000380046000e0000000f00000010004600000011000000120000001300141516173200340000005e0096006c000200720019000000320036000000720084007e001b0000001c003200390000008400000090001e0000001f0033003200000096000000a4000200aa0021000000330034000000aa00bc00b600230000002400330037000000bc000000c800260000002700340030000000', 'hex'),
      object: {
        bool: true,
        byte: 2,
        int16: 3,
        int32: 4,
        int64: new Long(6, 5, false),
        uint16: 7,
        uint32: 8,
        uint64: new Long(10, 9, true),
        float: roundFloatFromBuffer(11.12),
        object: {
          property: 13,
          array: [
            {
              element: 14,
              nested: {
                element1: 15,
                element2: 16,
              },
            },
            {
              element: 17,
              nested: {
                element1: 18,
                element2: 19,
              },
            },
          ],
        },
        bytes: Buffer.from([20, 21, 22, 23]),
        string: '24',
        array: [
          {
            element: 25,
            string: '26',
            nested: [
              { element1: 27, element2: 28, string: '29' },
              { element1: 30, element2: 31, string: '32' },
            ],
          },
          {
            element: 33,
            string: '34',
            nested: [
              { element1: 35, element2: 36, string: '37' },
              { element1: 38, element2: 39, string: '40' },
            ],
          },
        ],
      },
    },
  ],

  parse: [
    // TODO
  ],

  write: [
    {
      it: 'should use default (empty) values for missing properties',
      args: ['TEST_ALL', 1],
      buffer: Buffer.from('3a00e803000000003800000038000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', 'hex'),
      object: {},
    },
  ],
};
