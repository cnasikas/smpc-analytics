const util = require('util')
const fs = require('fs')
const { exec } = require('child_process')

const _writeFile = util.promisify(fs.writeFile)
const _exec = util.promisify(exec)
const _stat = util.promisify(fs.stat)
const _unlink = util.promisify(fs.unlink)

const _unlinkIfExists = async (filename) => {
  await _stat(filename)
  await _unlink(filename)
}

const colors = {
  'red': '\x1b[31m',
  'green': 'x1b[32m',
  'yellow': '\x1b[33m',
  'reset': '\x1b[0m'
}

module.exports = {
  _writeFile,
  _exec,
  _stat,
  _unlink,
  _unlinkIfExists,
  colors
}
