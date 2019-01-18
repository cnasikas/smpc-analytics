const express = require('express')
const path = require('path')
const uuidv4 = require('uuid/v4')
const DateDiff = require('date-diff')

const { db, cachedb } = require('./db')
const { colors, importLocally, importFromServers, _writeFile, _exec, _unlinkIfExists } = require('./helpers')

const router = express.Router()

const BASE_DIR = path.resolve(__dirname, '../')
const SIMULATION_MODE = process.argv.some((arg) => (arg === '-sim' || arg === '--sim' || arg === '-simulation' || arg === '--simulation'))
const PRINT_MSG = (SIMULATION_MODE) ? 'NODE SIMULATION' : 'NODE'

router.get('/queue', async (req, res, next) => {
  let request = req.query.request

  try {
    const value = await db.get(request)
    res.status(200).json(JSON.parse(value))
  } catch (err) {
    console.log(`${colors.red}[NODE] ${colors.reset}${err}`)
    next(err)
  }
})

router.post('/count', async (req, res, next) => {
  const content = JSON.stringify(req.body)
  const uid = uuidv4()
  const attributes = req.body.attributes
  const datasources = req.body.datasources
  let cache = req.body.cache

  let plot = ('plot' in req.body) // if plot exists in req.body
  await db.put(uid, JSON.stringify({ 'status': 'running' }))

  if (!plot) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(202).json({ 'location': `/smpc/queue?request=${uid}` })
  }

  // if filters are defined
  let requestKey = { 'attributes': attributes, 'datasources': datasources, 'plot': plot }

  if ('filters' in req.body) {
    const filters = req.body.filters
    // Add filter attributes for importing to list
    for (let condition of filters.conditions) {
      const attribute = condition.attribute

      if (!attributes.includes(attribute)) {
        attributes.push(attribute)
      }
    }

    requestKey.plot = plot
  }

  requestKey = JSON.stringify(requestKey)

  // Check if request has been already computed
  cache = cache && cache.toUpperCase() !== 'NO'

  let computationResponse = ''
  let cachedResponse = null

  if (cache) {
    cachedResponse = await getFromCache(requestKey, uid, plot)
  }

  try {
    if (cache && cachedResponse) {
      if (plot) {
        return res.status(200).json(JSON.parse(cachedResponse.slice(1, -1))) // slice is for removing quotes from string.
      } else {
        console.log('[' + PRINT_MSG + '] Request(' + uid + ') Response ready.\n')
        const resultObj = { 'status': 'succeeded', 'result': '' }
        resultObj.result = JSON.parse(cachedResponse)
        await db.put(uid, JSON.stringify(resultObj))
      }
    } else {
      computationResponse = await computeCount(attributes, datasources, uid, content, plot)

      let toCache = ''
      let graphName = ''

      if (plot) {
        console.log('[' + PRINT_MSG + '] Request(' + uid + ') Plotting done.\n')
        graphName = computationResponse.toString()
        graphName = graphName.slice(0, -1)
        console.log('[' + PRINT_MSG + '] Request(' + uid + ') ' + graphName)
        toCache = JSON.stringify(computationResponse.replace(/\n/g, ''))
      } else {
        console.log('[' + PRINT_MSG + '] Request(' + uid + ') Response ready.\n')
        const resultObj = { 'status': 'succeeded', 'result': '' }
        resultObj.result = JSON.parse(computationResponse)
        await db.put(uid, JSON.stringify(resultObj))
        toCache = computationResponse
      }

      await cachedb.put(requestKey, toCache + ', date:' + new Date())

      if (plot) {
        return res.send(graphName)
      }
    }
  } catch (err) {
    console.log(colors.red + '[' + PRINT_MSG + '] ' + colors.reset + err)
    return next(err)
  }
})

const computeCount = async (attributes, datasources, uid, content, plot = false) => {
  let importPromises = []

  if (SIMULATION_MODE) {
    importPromises = importLocally(attributes, datasources, BASE_DIR, uid, 'mesh')
  } else {
    importPromises = importFromServers(attributes, datasources, BASE_DIR, uid, '/smpc/import', 'MHMDdns.json')
  }

  await Promise.all(importPromises)
  console.log(colors.green + 'Importing Finished ' + colors.reset)

  await _writeFile(path.join(BASE_DIR, `configuration_${uid}.json`), content, 'utf8')
  console.log('[' + PRINT_MSG + '] Request(' + uid + ') Configuration file was saved.\n')

  let cmd = `python dataset-scripts/main_generator.py configuration_${uid}.json --DNS web/`
  cmd = SIMULATION_MODE ? cmd + 'localDNS.json' : cmd + 'MHMDdns_cvi.json'

  await _exec(cmd, {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  console.log('[' + PRINT_MSG + '] Request(' + uid + ') Main generated.\n')
  const dbMsg = SIMULATION_MODE ? 'SecreC code generated. Now compiling.' : 'SecreC code generated. Now compiling and running.'

  await db.put(uid, JSON.stringify({ 'status': 'running', 'step': dbMsg }))
  await _unlinkIfExists(path.join(BASE_DIR, `/histogram/.main_${uid}.sb.src`))
  console.log('[' + PRINT_MSG + '] Old .main_' + uid + '.sb.src deleted.\n')

  const execArg = (SIMULATION_MODE) ? 'sharemind-scripts/compile.sh histogram/main_' : 'sharemind-scripts/sm_compile_and_run.sh histogram/main_'
  await _exec(`${execArg}${uid}.sc`, { stdio: [0, 1, 2], cwd: BASE_DIR, shell: '/bin/bash' })

  await db.put(uid, JSON.stringify({
    'status': 'running',
    'step': 'SecreC code compiled. Now running.'
  }))

  console.log('[NODE SIMULATION] Request(' + uid + ') Program compiled.\n')

  await _exec('sharemind-scripts/run.sh histogram/main_' + uid + '.sb 2> out_' + uid + '.txt', {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  await db.put(uid, JSON.stringify({
    'status': 'running',
    'step': 'SecreC code compiled and run. Now generating output.'
  }))

  console.log('[NODE] Request(' + uid + ') Program executed.\n')

  await _exec('grep --fixed-strings --text "`grep --text "' + uid + '" /etc/sharemind/server.log | tail -n 1 | cut -d " "  -f "7-8"`" /etc/sharemind/server.log | cut -d " "  -f "9-" >  out_' + uid + '.txt', {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  if (SIMULATION_MODE) {
    await db.put(uid, JSON.stringify({
      'status': 'running',
      'step': 'SecreC code run. Now generating output.'
    }))
    console.log('[NODE SIMULATION] Request(' + uid + ') Program executed.\n')
  }

  let execResults = ''

  if (plot) {
    execResults = await _exec('python plot.py ../configuration_' + uid + '.json')
  } else {
    execResults = await _exec('python web/response.py out_' + uid + '.txt', { cwd: BASE_DIR, shell: '/bin/bash' })
  }

  const { stdout, stderr } = execResults

  if (stderr) {
    throw new Error(stderr)
  }

  return stdout
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

module.exports = {
  '/smpc': router
}
