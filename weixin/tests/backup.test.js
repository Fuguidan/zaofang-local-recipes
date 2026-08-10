const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

global.wx = {
  getFileSystemManager: () => ({
    openSync: ({ filePath, flag }) => fs.openSync(filePath, flag),
    closeSync: ({ fd }) => fs.closeSync(fd),
    writeSync: ({ fd, data, offset, length, position }) => fs.writeSync(fd, new Uint8Array(data), offset, length, position),
    statSync: (filePath) => fs.statSync(filePath),
    readSync: ({ fd, arrayBuffer, offset, length, position }) => ({ bytesRead: fs.readSync(fd, new Uint8Array(arrayBuffer), offset, length, position) }),
  }),
}
const { crc32, utf8Encode, utf8Decode, safeFilename, CHUNK_SIZE, createZip } = require('../utils/backup')

test('uses bounded 256KB chunks for file backup transport', () => {
  assert.equal(CHUNK_SIZE, 256 * 1024)
})

test('implements standard CRC32 for ZIP entries', () => {
  assert.equal(crc32(utf8Encode('123456789')), 0xcbf43926)
})

test('round-trips Chinese backup JSON text', () => {
  const text = JSON.stringify({ name: '番茄炒蛋', tags: ['家常菜'] })
  assert.equal(utf8Decode(utf8Encode(text)), text)
})

test('sanitizes exported ZIP filenames', () => {
  assert.equal(safeFilename('灶房/备份'), '灶房-备份.zip')
  assert.equal(safeFilename('已有.zip'), '已有.zip')
})

test('creates a standards-compatible ZIP containing Chinese JSON', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zaofang-weixin-'))
  const archive = path.join(directory, 'backup.zip')
  try {
    await createZip([
      { name: 'manifest.json', bytes: utf8Encode('{"format":"zaofan-backup"}') },
      { name: 'data.json', bytes: utf8Encode('{"name":"番茄炒蛋"}') },
    ], archive)
    assert.match(execFileSync('unzip', ['-t', archive], { encoding: 'utf8' }), /No errors detected/)
    assert.equal(execFileSync('unzip', ['-p', archive, 'data.json'], { encoding: 'utf8' }), '{"name":"番茄炒蛋"}')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('streams an image larger than 20MB without assembling it in memory', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zaofang-weixin-large-'))
  const source = path.join(directory, 'large-image.jpg')
  const archive = path.join(directory, 'large-backup.zip')
  try {
    const fd = fs.openSync(source, 'w')
    fs.writeSync(fd, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 0, 4, 21 * 1024 * 1024 - 4)
    fs.closeSync(fd)
    const progress = []
    const result = await createZip([{ name: 'images/large.jpg', filePath: source }], archive, (item) => progress.push(item))
    assert.ok(result.size > 20 * 1024 * 1024)
    assert.equal(progress.length, 1)
    assert.match(execFileSync('unzip', ['-t', archive], { encoding: 'utf8' }), /No errors detected/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
