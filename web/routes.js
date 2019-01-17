const express = require('express')
const db = require('./db')
const { colors } = require('./helpers')

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

module.exports = {
  '/smpc': router
}
