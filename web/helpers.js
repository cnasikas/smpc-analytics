const util = require('util')
const fs = require('fs')
const { exec } = require('child_process')
const axios = require('axios')
const DateDiff = require('date-diff')
const _ = require('lodash')

const { db, cachedb } = require('./db')
const { PRINT_MSG } = require('./config')

const _writeFile = util.promisify(fs.writeFile)
const _readFile = util.promisify(fs.readFile)
const _exec = util.promisify(exec)
const _stat = util.promisify(fs.stat)
const _unlink = util.promisify(fs.unlink)

const _unlinkIfExists = async (filename) => {
  await _stat(filename)
  await _unlink(filename)
}

function _sendRequest (datasrc, mhmdDNS, attributes, uid, action) {
  const uri = `http://${mhmdDNS[datasrc]}${action}`
  console.log(`${colors.green} Request for import sent to: ${datasrc} at ${uri} ${colors.reset}`)

  return axios.post(uri, {
    'attributes': attributes,
    'datasource': datasrc + '_' + uid
  })
}

const importFromServers = async (attributes, datasources, uid, action, DNSfile) => {
  const mhmdDNS = JSON.parse(await _readFile(DNSfile, 'utf8'))

  if (typeof datasources === 'undefined') {
    datasources = Object.keys(mhmdDNS)
  }

  for (let datasrc of datasources) { // Check that all IPs exist
    if ((datasrc in mhmdDNS) === false) { // If datasrc does not exist in DNS file, continue
      console.log(colors.red + 'Error: ' + colors.reset + 'Unable to find IP for ' + datasrc + ', it does not exist in MHMDdns.json file.')
      throw new Error('Failure on data importing from ' + datasrc)
    }
  }

  // since no error occured in the above loop, we have all IPs
  db.put(uid, JSON.stringify({ 'status': 'running', 'step': 'Securely importing data' }))

  // // send the requests for import
  const importPromises = []

  for (let datasrc of datasources) {
    importPromises.push(_sendRequest(datasrc, mhmdDNS, attributes, uid, action))
  }
  // return array of promises for import
  return importPromises
}

// function to import local data and return promise
const importLocally = async (attributes, datasources, parent, uid, type) => {
  const localDNS = JSON.parse(await _readFile('localDNS.json', 'utf8'))

  if (typeof datasources === 'undefined') {
    datasources = Object.keys(localDNS)
  }

  for (let datasrc of datasources) { // Check that all IPs exist
    if ((datasrc in localDNS) === false) { // If datasrc does not exist in DNS file, continue
      console.log(colors.red + 'Error: ' + colors.reset + 'Unable to find path for ' + datasrc + ', it does not exist in localDNS.json file.')
      throw new Error('Failure on data importing from ' + datasrc)
    }
  }

  if (type === 'mesh') {
    for (let datasrc of datasources) {
      const patientFile = localDNS[datasrc][type]
      const csvFile = './datasets/' + datasrc + '_' + uid + '.csv'
      localDNS[datasrc][type] = csvFile
      console.log('[NODE SIMULATION] python mhmd-driver/mesh_json_to_csv.py "' + attributes.join(' ') + '" ' + patientFile + ' --output ' + csvFile + ' --mtrees ./mhmd-driver/m.json --mtrees_inverted ./mhmd-driver/m_inv.json --mapping ./mhmd-driver/mesh_mapping.json\n')
      await _exec('python mhmd-driver/mesh_json_to_csv.py "' + attributes.join(' ') + '" ' + patientFile + ' --output ' + csvFile + ' --mtrees ./mhmd-driver/m.json --mtrees_inverted ./mhmd-driver/m_inv.json --mapping ./mhmd-driver/mesh_mapping.json', {
        stdio: [0, 1, 2],
        cwd: parent,
        shell: '/bin/bash'
      })
    }
  }

  const importPromises = []
  // exec asynch python simulated imports
  for (let datasrc of datasources) {
    const dataset = localDNS[datasrc][type]
    console.log('[NODE SIMULATION] Request(' + uid + ') python ./dataset-scripts/simulated_import.py ' + dataset + ' --attributes "' + attributes.join(';') + '" --table "' + datasrc + '_' + uid + '"\n')
    importPromises.push(_exec('python ./dataset-scripts/simulated_import.py ' + dataset + ' --attributes "' + attributes.join(';') + '" --table "' + datasrc + '_' + uid + '"', {
      stdio: [0, 1, 2],
      cwd: parent,
      shell: '/bin/bash'
    }))
  }
  // return array of promises for import
  return importPromises
}

const processRequest = async (uid, req, res) => {
  const content = JSON.stringify(req.body)
  let attributes = req.body.attributes
  const datasources = req.body.datasources
  let cache = req.body.cache
  const plot = ('plot' in req.body)

  await db.put(uid, JSON.stringify({ 'status': 'running' }))

  if (!('plot' in req.body)) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(202).json({ 'location': `/smpc/queue?request=${uid}` })
  }

  if (_.isArray(attributes[0])) {
    attributes = _.uniq(_.flatten(attributes).map(a => a.name))
  }

  let requestKey = { attributes, datasources, plot }

  if ('filters' in req.body && req.body.filters.conditions) {
    let filters = req.body.filters.conditions.map(c => c.attribute)
    requestKey.attributes = _.union(attributes, filters)
    requestKey.plot = plot
    requestKey.filters = filters
  }

  requestKey = JSON.stringify(requestKey)

  // Check if request has been already computed
  cache = cache && cache.toUpperCase() !== 'NO'

  let cachedResponse = null

  if (cache) {
    cachedResponse = await getFromCache(requestKey, uid, plot)
  }

  return { uid, attributes, datasources, content, cache, plot, cachedResponse, requestKey }
}

const getFromCache = async (requestKey, uid) => {
  let value = await cachedb.get(requestKey)
  console.log('[' + PRINT_MSG + '] ' + colors.green + 'Request(' + uid + ') Key: ' + requestKey + ' found in cache-db!\n' + colors.reset)

  let valueArray = value.split(', date:')
  let diff = new DateDiff(new Date(), new Date(valueArray[1]))

  // if previous computation was a month ago, recompute it
  if (diff.days() > 30) {
    console.log('[' + PRINT_MSG + '] ' + colors.yellow + 'Request(' + uid + ') Key: ' + requestKey + ' has expired, goind to recompute it!\n' + colors.reset)
    await cachedb.del(requestKey)

    return null
  }

  return valueArray[0]
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
  _sendRequest,
  importLocally,
  importFromServers,
  processRequest,
  colors
}
