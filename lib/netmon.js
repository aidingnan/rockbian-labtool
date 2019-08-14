const EventEmitter = require('events')
const os = require('os')

class NetMon extends EventEmitter {

  constructor(opts) {
    super()
    this.soldiers = opts.soldiers
    this.logger = opts.logger 

    process.nextTick(() => this.run())
    setInterval(() => {
      this.run()
    }, 5000)
  }

  run () {
    let ifaceObj = os.networkInterfaces()
    for (var name in ifaceObj) {
      if (this.soldiers.find(s => s.name === name)) {
        continue
      } else {
        let ipv4 = ifaceObj[name].find(addr => addr.family === 'IPv4')
        if (!ipv4) continue

        let { address, netmask, mac } = ipv4
        if (!mac.startsWith('98:e8:fb:')) continue
        if (!address.startsWith('169.254.')) continue
        if (netmask !== '255.255.0.0') continue

        let ns = mac.split(':')
        let n3 = parseInt(ns[3]).toString()
        let n4 = parseInt(ns[4]).toString()
        this.emit('iface', { name, ip: `169.254.${n3}.${n4}` })
      }
    }
  }
}

module.exports = NetMon
