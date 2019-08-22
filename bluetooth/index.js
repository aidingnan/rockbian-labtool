const EventEmitter = require('events')
const Bluetoothctl = require('./bluetoothctl')
const GattClient = require('./gatt-client')

const SERVICES = [
  {
    name: 'auth',
    uuid: '60000000-0182-406c-9221-0a6680bd0943',
    readCharUUID: '60000002-0182-406c-9221-0a6680bd0943',
    writeCharUUID: '60000003-0182-406c-9221-0a6680bd0943',
  },
  {
    name: 'net',
    uuid: '70000000-0182-406c-9221-0a6680bd0943',
    readCharUUID: '70000002-0182-406c-9221-0a6680bd0943',
    writeCharUUID: '70000003-0182-406c-9221-0a6680bd0943',
  }
] 

class Bluetooth extends EventEmitter {
  constructor () {
    super()

    this.main = new Bluetoothctl({
      name: 'main',
      powerCycle: false,
      role: 'scan',
      log: {
        cmd: true,
      }
    })

    this.gatts = []
  }

  devices (callback) {
    this.main.devices(callback)
  }

  deviceInfo (addr, callback) {
    this.main.deviceInfo(addr, callback)
  }

  // addr: string bluetooth dev addr, or array [addr, devname] 
  // name: service name, auth or net (uuid not supported)
  // obj: data to send
  request (addr, name, obj, callback) {
    let devname
    if (Array.isArray(addr)) {
      devname = addr[1]
      addr = addr[0]
    }

    let gatt = this.gatts.find(c => c.addr === addr)
    if (gatt) {
      gatt.request(name, obj, callback) 
    } else if (!devname) {
      this.deviceInfo(addr, (err, info) => {
        if (err) {
          callback(err)
        } else {
          this.request([addr, info.name], name, obj, callback)
        }
      })
    } else {
      const gatt = new GattClient({
        name: devname,
        addr: addr,
        services: SERVICES 
      })
      gatt.request(name, obj, callback)
      this.gatts.push(gatt)
    }
  }
} 

module.exports = Bluetooth
