'use strict'

const config = require('./config')
const startIpfs = require('./start-ipfs')
const startServer = require('./start-server')
const request = require('ipfs-registry-mirror-common/utils/retry-request')
const { spawn } = require('child_process')
const which = require('which-promise')
var OutputBuffer = require('output-buffer')

const cleanUpOps = []

const cleanUp = async () => {
  Promise.all(
    cleanUpOps.map(op => op())
  )
    .then(() => {
      process.exit(0)
    })
}

process.on('SIGTERM', cleanUp)
process.on('SIGINT', cleanUp)

module.exports = async (options) => {
  options = config(options)

  const ipfs = await startIpfs(options)

  cleanUpOps.push(() => {
    return new Promise((resolve) => {
      ipfs.stop(() => {
        console.info('👿 IPFS node stopped') // eslint-disable-line no-console
        resolve()
      })
    })
  })

  console.info('👂 Loading replication master id from', options.ipfs.index) // eslint-disable-line no-console

  const master = await request(Object.assign({}, options.request, {
    url: options.ipfs.index,
    json: true
  }))

  console.info('☎️  Dialing replication master', master.ipfs.addresses.join(',')) // eslint-disable-line no-console

  let connected

  await Promise.all(
    master.ipfs.addresses.map(addr => {
      return ipfs.api.swarm.connect(master.ipfs.addresses[0])
        .then(() => {
          connected = true
        })
        .catch((error) => {
          console.info(error)
        })
    })
  )

  if (connected) {
    console.info('🗑️  Replacing old registry index if it exists') // eslint-disable-line no-console

    try {
      await ipfs.api.files.rm(options.ipfs.prefix, {
        recursive: true
      })
    } catch (error) {

    }

    console.info('📠 Copying registry index', master.root, 'to', options.ipfs.prefix) // eslint-disable-line no-console

    await ipfs.api.files.cp(master.root, options.ipfs.prefix)

    console.info('💌 Copied registry index', master.root, 'to', options.ipfs.prefix) // eslint-disable-line no-console
  } else {
    console.info('⚰️  Could not dial master, running without latest registry index') // eslint-disable-line no-console
  }

  console.info('👩‍🚀 Starting local proxy') // eslint-disable-line no-console

  const server = await startServer(options, ipfs.api)

  cleanUpOps.push(() => {
    return new Promise((resolve) => {
      server.close(() => {
        console.info('✋ Server stopped') // eslint-disable-line no-console
        resolve()
      })
    })
  })

  const packageManager = await which(options.packageManager)

  console.info(`🎁 Installing dependencies with ${packageManager}`) // eslint-disable-line no-console

  const proc = spawn(packageManager, [
    `--registry=http://localhost:${options.http.port}`
  ].concat(process.argv.slice(2)))

  const buffer = new OutputBuffer((line) => {
    console.info(`🐨 ${line}`) // eslint-disable-line no-console
  })

  proc.stdout.on('data', (data) => {
    buffer.append(data.toString())
  })

  proc.stderr.on('data', (data) => {
    buffer.append(data.toString())
  })

  proc.on('close', async (code) => {
    buffer.flush()

    console.log(`🎁 ${packageManager} exited with code ${code}`) // eslint-disable-line no-console

    await cleanUp()

    process.exit(code)
  })
}
