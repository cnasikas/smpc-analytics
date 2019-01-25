const https = require('https')
const http = require('http')
const express = require('express')
const fs = require('fs')
const path = require('path')
const helmet = require('helmet')
const cors = require('cors')
const bodyParser = require('body-parser')
const morgan = require('morgan') // for requests logging
const morganBody = require('morgan-body')

const { ErrorHandler } = require('./middlewares/error')
const routes = require('./routes')

const app = express()

const FRONTEND_PATH = path.join(__dirname, '/frontend/')
const SIMULATION_MODE = process.argv.some((arg) => (arg === '-sim' || arg === '--sim' || arg === '-simulation' || arg === '--simulation'))
const PRINT_MSG = (SIMULATION_MODE) ? 'NODE SIMULATION' : 'NODE'
const HTTP_PORT = 80
const HTTPS_PORT = 443

global.__basedir = __dirname

const logStream = fs.createWriteStream(path.join(__dirname, 'requests.log'), { flags: 'a' })
morganBody(app, { stream: logStream }) // log request body

app.use(helmet())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors({
  origin: '*',
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}))

app.use(morgan(':remote-addr \\n\\n', { stream: logStream })) // log request IP

for (const url in routes) {
  app.use(url, routes[url])
}

app.use(ErrorHandler)

app.use(express.static(path.join(__dirname, 'frontend'))) // public/static files
app.use('/visuals', express.static(path.join(__dirname, '/visuals')))
app.use('/graphs', express.static(path.join(__dirname, '/graphs')))
app.use('/.well-known/acme-challenge/', express.static(path.join(__dirname, '/.well-known/acme-challenge/')))

if (SIMULATION_MODE) {
  console.log('\n[NODE SIMULATION] Running in simulation mode\n')
} else {
  console.log('\n[NODE] Running in Secure Multiparty Computation mode with 3 servers\n')
}

app.get('/', function (req, res) {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'))
})

if (fs.existsSync('./sslcert/fullchain.pem')) {
  const options = {
    cert: fs.readFileSync('./sslcert/fullchain.pem'),
    key: fs.readFileSync('./sslcert/privkey.pem')
  }

  http.createServer(function (req, res) {
    if ('headers' in req && 'host' in req.headers) {
      res.writeHead(307, { 'Location': 'https://' + req.headers.host.replace(HTTP_PORT, HTTPS_PORT) + req.url })
      console.log('http request, will go to >> ')
      console.log('https://' + req.headers.host.replace(HTTP_PORT, HTTPS_PORT) + req.url)
      res.end()
    }
  }).listen(HTTP_PORT)

  const server = https.createServer(options, app).listen(HTTPS_PORT, () => console.log('Example app listening on port ' + HTTPS_PORT + '!'))
  server.setTimeout(2000 * 60 * 60) // ((2 sec * 60 = 2 min) * 60 = 2 hours)
} else {
  const port = 3000
  let server = app.listen(port, () => console.log('Example app listening on port ' + port + '!'))
  server.setTimeout(2000 * 60 * 60) // ((2 sec * 60 = 2 min) * 60 = 2 hours)
}
