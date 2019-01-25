const path = require('path')

const BASE_DIR = path.resolve(__dirname, '../')
const SIMULATION_MODE = process.argv.some((arg) => (arg === '-sim' || arg === '--sim' || arg === '-simulation' || arg === '--simulation'))
const PRINT_MSG = (SIMULATION_MODE) ? 'NODE SIMULATION' : 'NODE'
const FRONTEND_PATH = path.join(__dirname, '/frontend/')
const HTTP_PORT = 80
const HTTPS_PORT = 443

const colors = {
  'red': '\x1b[31m',
  'green': '\x1b[32m',
  'yellow': '\x1b[33m',
  'reset': '\x1b[0m'
}

module.exports = {
  BASE_DIR,
  SIMULATION_MODE,
  PRINT_MSG,
  FRONTEND_PATH,
  HTTP_PORT,
  HTTPS_PORT,
  colors
}
