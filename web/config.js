const path = require('path')

const BASE_DIR = path.resolve(__dirname, '../')
const SIMULATION_MODE = process.argv.some((arg) => (arg === '-sim' || arg === '--sim' || arg === '-simulation' || arg === '--simulation'))
const PRINT_MSG = (SIMULATION_MODE) ? 'NODE SIMULATION' : 'NODE'

module.exports = {
  BASE_DIR,
  SIMULATION_MODE,
  PRINT_MSG
}
