const ErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  return res.status(500).send(
    {
      error: { code: 500, message: err.message }
    }
  )
}

module.exports = {
  ErrorHandler
}
