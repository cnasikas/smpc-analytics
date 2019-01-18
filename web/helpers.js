const util = require('util')
const fs = require('fs')
const { exec } = require('child_process')
const axios = require('axios')

const { db } = require('./db')

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
  colors
}
