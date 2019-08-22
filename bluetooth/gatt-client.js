const EventEmitter = require('events')

const Bluetoothctl = require('./bluetoothctl')

class GattClient extends EventEmitter {
  // name
  // address
  // services
  constructor (opts = {}) {
    super()
    this.name = opts.name
    this.addr = opts.addr

    if (typeof opts !== 'object') throw new Error('invalid opts')

    this.services = opts.services 
    this.services.forEach(svc => {
      if (!svc.uuid || !svc.readCharUUID || !svc.writeCharUUID) {
        this.emit('error', new Error('bad service'))
      }
      svc.name = svc.name || svc.uuid.slice(0, 8)
    })

    this.conn = new Bluetoothctl({
      role: 'gatt',
      name: this.name,
      suffix: '.conn',
      addr: this.addr,
      log: {
        cmd: true
      }
    })

    this.conn.on('error', err => this.emit(err))
    this.conn.on('connected', () => {
      this.conn.listAttributes((err, svcs) => {

        let readies = 0
        this.services.forEach(service => {
          let svc = svcs.find(svc => svc.uuid === service.uuid)
          if (!svc) this.emit('error', new Error('service not found'))

          let chars = svc.characteristics
          if (!chars.find(char => char.uuid === service.readCharUUID)) 
            this.emit('error', new Error('read char uuid not found'))
          if (!chars.find(char => char.uuid === service.writeCharUUID))
            this.emit('error', new Error('write char uuid not found'))

          const source = new Bluetoothctl({
            role: 'char',
            name: this.name,
            suffix: `.${service.name}.source`,
            addr: this.addr,
            serviceUUID: service.uuid,
            charUUID: service.readCharUUID,
            charType: 'source',
            log: {
              cmd: service.name === 'auth',
              // msg: true
            }
          }) 

          const sink = new Bluetoothctl({
            role: 'char',
            name: this.name,
            suffix: `.${service.name}.sink`,
            addr: this.addr,
            serviceUUID: service.uuid,
            charUUID: service.writeCharUUID,
            charType: 'sink',
            log: {
              cmd: service.name === 'auth',
            }
          })

          source.once('ready', () => {
            (!--readies) && (this.ready = true, this.emit('ready'))
          })
          readies++

          sink.once('ready', () => {
            (!--readies) && (this.ready = true, this.emit('ready'))
          })
          readies++

          service.source = source
          service.sink = sink
        }) 
      })
    })
  }

  request (name, obj, callback) {
    const next = () => {
      const service = this.services.find(s => s.name === name)
      if (!service) {
        console.log('================================')
        console.log(service)
        console.log('================================')
        process.nextTick(() => callback(new Error('service not found'))  )
      } else {

        let { source, sink } = service
        let timer

        const srcErr = err => {
          clearTimeout(timer)
          source.removeListener('message', srcMsg)
          callback(err)
        }

        const srcMsg = msg => {
          clearTimeout(timer) 
          source.removeListener('error', srcErr)
          callback(null, msg)
        }

        source.once('error', srcErr)
        source.once('message', srcMsg)
        sink.write(obj, err => err => {
          if (err) {
            source.removeListener('error', srcErr)
            source.removeListener('message', srcMsg)
            callback(err) 
          }      
        })

        timer = setTimeout(() => source.read(), 1000)
      }
    }

    if (this.ready) {
      next() 
    } else {
      const onReady = () => {
        this.removeListener('error', onError)
        next()
      }

      const onError = err => (this.removeListener('ready', onReady), callback(err))
      this.on('error', onError)  
      this.on('ready', onReady)
    }
  }
}

module.exports = GattClient
