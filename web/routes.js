const express = require('express')
const path = require('path')
const uuidv4 = require('uuid/v4')

const { db, cachedb } = require('./db')
const {
  colors,
  importLocally,
  importFromServers,
  _writeFile,
  _exec,
  _unlinkIfExists,
  processRequest
} = require('./helpers')

const { BASE_DIR, SIMULATION_MODE, PRINT_MSG } = require('./config')

const router = express.Router()

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
  const uid = uuidv4()
  let generator = `python dataset-scripts/count_main_generator.py configuration_${uid}.json`
  let compileCMD = 'sharemind-scripts/sm_compile_and_run.sh histogram/main_'

  if (SIMULATION_MODE) {
    generator += ' --DNS web/localDNS.json'
    compileCMD = 'sharemind-scripts/compile.sh histogram/main_'
  }

  const computeOptions = {
    algorithm: 'histogram',
    cmd: {
      generator,
      compile: `${compileCMD}${uid}.sc`,
      run: `sharemind-scripts/run.sh histogram/main_${uid}.sb 2> out_${uid}.txt`,
      out: 'grep --fixed-strings --text "`grep --text "' + uid + '" /etc/sharemind/server.log | tail -n 1 | cut -d " "  -f "7-8"`" /etc/sharemind/server.log | cut -d " "  -f "9-" >  out_' + uid + '.txt',
      plot: `python count_plot.py ../out_${uid}.txt ../configuration_${uid}.json`,
      web: `python web/response.py out_${uid}.txt | python web/transform_response.py  configuration_${uid}.json --mapping mhmd-driver/mesh_mapping.json --mtrees_inverted mhmd-driver/m_inv.json`
    },
    uri: '/smpc/import',
    type: 'mesh',
    dnsFile: 'MHMDdns.json',
    mainFile: path.join(BASE_DIR, `/histogram/.main_${uid}.sb.src`)
  }

  try {
    await compute(req, res, uid, computeOptions)
  } catch (err) {
    console.log(colors.red + '[' + PRINT_MSG + '] ' + colors.reset + err)
    next(err)
  }
})

router.post('/histogram', async (req, res, next) => {
  const uid = uuidv4()

  let generator = `python dataset-scripts/main_generator.py configuration_${uid}.json --DNS web/MHMDdns_cvi.json`
  let compileCMD = 'sharemind-scripts/sm_compile_and_run.sh histogram/main_'

  if (SIMULATION_MODE) {
    generator += 'localDNS.json'
    compileCMD = 'sharemind-scripts/compile.sh histogram/main_'
  }

  const computeOptions = {
    algorithm: 'histogram',
    cmd: {
      generator,
      compile: `${compileCMD}${uid}.sc`,
      run: `sharemind-scripts/run.sh histogram/main_${uid}.sb 2> out_${uid}.txt`,
      out: 'grep --fixed-strings --text "`grep --text "' + uid + '" /etc/sharemind/server.log | tail -n 1 | cut -d " "  -f "7-8"`" /etc/sharemind/server.log | cut -d " "  -f "9-" >  out_' + uid + '.txt',
      plot: `python plot.py ../configuration_${uid}.json`,
      web: `python web/response.py out_${uid}.txt`
    },
    uri: '/smpc/import/cvi',
    type: 'cvi',
    dnsFile: 'MHMDdns_cvi.json',
    mainFile: path.join(BASE_DIR, `/histogram/.main_${uid}.sb.src`)
  }

  try {
    await compute(req, res, uid, computeOptions)
  } catch (err) {
    console.log(colors.red + '[' + PRINT_MSG + '] ' + colors.reset + err)
    next(err)
  }
})

router.post('/decision_tree', async (req, res, next) => {
  const uid = uuidv4()
  const classifier = ('classifier' in req.body) ? req.body.classifier.toLowerCase() : 'id3'

  if (!('dataset' in req.body)) {
    res.sendStatus(400)
  }

  const cvi = (req.body.dataset === 'cvi')

  let generator = `python dataset-scripts/${classifier}_main_generator.py configuration_${uid}.json`
  let compileCMD = 'sharemind-scripts/sm_compile_and_run.sh decision-tree/main_'

  if (SIMULATION_MODE) {
    generator += ' --DNS web/localDNS.json'
    compileCMD = 'sharemind-scripts/compile.sh decision-tree/main_'
  }

  const computeOptions = {
    algorithm: 'decision_tree',
    classifier,
    cmd: {
      generator,
      compile: `${compileCMD}${uid}.sc`,
      run: `set -o pipefail && sharemind-scripts/run.sh decision-tree/main_${uid}.sb  2>&1 >/dev/null | sed --expression="s/,  }/ }/g" > out_${uid}.json`,
      out: 'grep --fixed-strings --text "`grep --text "' + uid + '" /etc/sharemind/server.log | tail -n 1 | cut -d " "  -f "7-8"`" /etc/sharemind/server.log | cut -d " "  -f "9-" | sed --expression="s/,  }/ }/g" >  out_' + uid + '.json',
      plot: `python web/${classifier}_response.py out_${uid}.json configuration_${uid}.json --plot`,
      web: `python web/${classifier}_response.py out_${uid}.json configuration_${uid}.json`
    },
    uri: cvi ? '/smpc/import/cvi' : '/smpc/import',
    type: cvi ? 'cvi' : 'mesh',
    dnsFile: cvi ? 'MHMDdns_cvi.json' : 'MHMDdns.json',
    mainFile: path.join(BASE_DIR, `/decision-tree/.main_${uid}.sb.src`)
  }

  try {
    await compute(req, res, uid, computeOptions)
  } catch (err) {
    console.log(colors.red + '[' + PRINT_MSG + '] ' + colors.reset + err)
    next(err)
  }
})

const compute = async (req, res, uid, computeOptions) => {
  let { attributes, datasources, content, cache, plot, cachedResponse, requestKey } = await processRequest(uid, req, res)

  let computationResponse = ''

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
    console.log(`[${PRINT_MSG}]${colors.yellow} Request(${uid}) Key: ${requestKey} not found in cache-db.\n${colors.reset}`)
    computationResponse = await smpc({ attributes, datasources, uid, content, plot }, computeOptions)

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
}

const smpc = async (request, computeOptions) => {
  let importPromises = []

  if (SIMULATION_MODE) {
    importPromises = await importLocally(request.attributes, request.datasources, request.uid, computeOptions.type)
  } else {
    importPromises = await importFromServers(request.attributes, request.datasources, request.uid, computeOptions.uri, computeOptions.dnsFile)
  }

  await Promise.all(importPromises)
  console.log(colors.green + 'Importing Finished ' + colors.reset)

  await _writeFile(path.join(BASE_DIR, `configuration_${request.uid}.json`), request.content, 'utf8')
  console.log('[' + PRINT_MSG + '] Request(' + request.uid + ') Configuration file was saved.\n')

  await _exec(computeOptions.cmd.generator, {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  console.log('[' + PRINT_MSG + '] Request(' + request.uid + ') Main generated.\n')
  const dbMsg = SIMULATION_MODE ? 'SecreC code generated. Now compiling.' : 'SecreC code generated. Now compiling and running.'

  await db.put(request.uid, JSON.stringify({ 'status': 'running', 'step': dbMsg }))
  await _unlinkIfExists(computeOptions.mainFile)
  console.log('[' + PRINT_MSG + '] Old .main_' + request.uid + '.sb.src deleted.\n')

  await _exec(computeOptions.cmd.compile, { stdio: [0, 1, 2], cwd: BASE_DIR, shell: '/bin/bash' })

  await db.put(request.uid, JSON.stringify({
    'status': 'running',
    'step': 'SecreC code compiled. Now running.'
  }))

  console.log('[NODE SIMULATION] Request(' + request.uid + ') Program compiled.\n')

  await _exec(computeOptions.cmd.run, {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  await db.put(request.uid, JSON.stringify({
    'status': 'running',
    'step': 'SecreC code compiled and run. Now generating output.'
  }))

  console.log('[NODE] Request(' + request.uid + ') Program executed.\n')

  await _exec(computeOptions.cmd.out, {
    stdio: [0, 1, 2],
    cwd: BASE_DIR,
    shell: '/bin/bash'
  })

  if (SIMULATION_MODE) {
    await db.put(request.uid, JSON.stringify({
      'status': 'running',
      'step': 'SecreC code run. Now generating output.'
    }))
    console.log('[NODE SIMULATION] Request(' + request.uid + ') Program executed.\n')
  }

  let execResults = ''

  if (request.plot) {
    execResults = await _exec(computeOptions.plot)
  } else {
    execResults = await _exec(computeOptions.web, { cwd: BASE_DIR, shell: '/bin/bash' })
  }

  const { stdout, stderr } = execResults

  if (stderr) {
    throw new Error(stderr)
  }

  return stdout
}

module.exports = {
  '/smpc': router
}
