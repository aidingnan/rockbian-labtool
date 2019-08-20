const EventEmitter = require('events')

const Bluetoothctl = require('./bluetoothctl')

class Channel extends EventEmitter {
  constructor(r, w) {

  }
}

const parseAttr = buf => {
  let obj = {}
  while (buf.length) {
    let type = buf.shift() 
    let path = buf.shift().trim()
    let uuid = buf.shift().trim()
    buf.shift() 

    if (type === 'Characteristic') {
      switch (uuid) {
        case '60000002-0182-406c-9221-0a6680bd0943':
          obj.authRead = path
          break
        case '60000003-0182-406c-9221-0a6680bd0943': 
          obj.authWrite = path
          break
        case '70000002-0182-406c-9221-0a6680bd0943':
          obj.netRead = path
          break
        case '70000003-0182-406c-9221-0a6680bd0943': 
          obj.netWrite = path
          break
       default: 
          break 
      }
    }
  }
  return obj
}

/**
class Channel extends EventEmitter {
  constructor (opts) {
    super()
    this.addr = opts.addr
    this.deviceName = opts.deviceName 
    this.readPath = opts.readPath
    this.writePath = opts.writePath

    this.reader = new Bluetoothctl()
    this.reader.once('prompt', prompt => {
      this.prompt = prompt
    })
  }

  // connect (
}
*/

class GattAttribute extends EventEmitter {
  constructor (opts) {
    super(opts)
    this.addr = opts.addr
    this.path = opts.path
    this.deviceName = opts.deviceName
    this.type = opts.type

    // this.connect()
  }
/**
  connect () {
    this.ctl = new Bluetoothctl(true, false)
    this.ctl.once('prompt', () => {
      this.ctl.send(`connect ${this.addr}`, 
      lines => {
        console.log('connect sync lines', lines)
        return true
      }, 
      lines => {
        console.log('connect async lines', lines)
        this.ctl.send('menu gatt', lines => {
          this.ctl.send(`select-attribute ${this.path}`, () => {
            if (this.type === 'read-notify') {
              this.ctl.send(`notify on`, null, lines => {})
            }
          })
        })
      })
    }) 
  }
*/
}

class Gatt extends Bluetoothctl {
  constructor (opts) {
    super(opts) 
    this.addr = 'CC:4B:73:3D:0C:31'
    this.ctl = new Bluetoothctl()
    this.ctl.once('prompt', prompt => {
      this.ctl.send(`connect ${this.addr}`, null, lines => {
        this.ctl.send('menu gatt', lines => {
          this.ctl.send(`list-attributes CC:4B:73:3D:0C:31`, lines => {
            Object.assign(this, parseAttr(lines))

        
            let reader = new GattAttribute({
              addr: this.addr,
              path: this.authRead,
              type: 'read-notify',
            })

            let writer = new GattAttribute({
              addr: this.addr,
              path: this.authWrite,
              type: 'write-read',
            })

          })
        })
      })
    })
    this.channels = []
  }

  auth () {
    let reader = new GattAttribute({
      addr: this.addr,
      path: this.authRead,
      type: 'read-notify',
    })

    let writer = new GattAttribute({
      addr: this.addr,
      path: this.authWrite,
      type: 'write-read' 
    })
  }
}

module.exports = Gatt
