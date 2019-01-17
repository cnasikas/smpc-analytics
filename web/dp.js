const level = require('level') // leveldb for requests-status and cache

const db = level('./mydb')
const cachedb = level('./cache-database')

module.exports = {
  db,
  cachedb
}
