const path = require('path')

const BASE_DIR = path.resolve(__dirname, '../')
const SIMULATION_MODE = process.argv.some((arg) => (arg === '-sim' || arg === '--sim' || arg === '-simulation' || arg === '--simulation'))
const PRINT_MSG = (SIMULATION_MODE) ? 'NODE SIMULATION' : 'NODE'

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
  colors
}
