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

module.exports = {
  _writeFile,
  _exec,
  _stat,
  _unlink,
  _unlinkIfExists
}
