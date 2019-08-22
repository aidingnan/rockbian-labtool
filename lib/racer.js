const EventEmitter = require('events')
const net = require('net')

class Racer extends EventEmitter {
  constructor (sockPath) {
    super()
    const race = sockPath => 
      net.createServer(x => x.on('error', () => {}))
        .on('error', err => net.createConnection(sockPath)
          .on('error', () => {})
          .on('connect', () => this.emit('slave'))
          .on('close', () => race()))
        .listen(sockPath, () => this.emit('master'))
  }
}

module.exports = socketPath => new Racer(socketPath)
