'use strict'

const log = require('debug')('ipfs:ipfs-npm:handlers:tarball')
const path = require('path')
const loadTarball = require('ipfs-registry-mirror-common/utils/load-tarball')
const lol = require('ipfs-registry-mirror-common/utils/error-message')

module.exports = (config, app) => {
  return async (request, response, next) => {
    log(`Requested ${request.path}`)

    let file = request.path

    log(`Loading ${file}`)

    const ipfs = await request.app.locals.ipfs()

    try {
      const readStream = await loadTarball(config, ipfs.api, file)

      readStream.on('error', (error) => {
        log(`Error loading ${file} - ${error}`)

        if (error.code === 'ECONNREFUSED') {
          response.statusCode = 504
        } else if (error.code === 'ECONNRESET') {
          // will trigger a retry from the npm client
          response.statusCode = 500
        } else {
          response.statusCode = 404
        }

        next(error)
      })
        .once('data', () => {
          log(`Loaded ${file}`)

          response.statusCode = 200
          response.setHeader('Content-Disposition', `attachment; filename="${path.basename(request.url)}"`)
        })
        .pipe(response)
    } catch (error) {
      console.error(`💥 Could not load tarball for ${file}`, error) // eslint-disable-line no-console

      if (error.message.includes('Not found')) {
        response.statusCode = 404
        response.send(lol(`💥 Could not load ${file}, has it been published?`))

        return
      }

      // a 500 will cause the npm client to retry
      response.statusCode = 500
      response.send(lol(`💥 ${error.message}`))
    }
  }
}
