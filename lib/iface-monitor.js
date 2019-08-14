const EventEmitter = require('events')
const child = require('child_process')
const os = require('os')
const udev = require('udev')

const blog = console

if (!process.getuid || process.getuid() !== 0) {
  console.log('udev requires root priviledge')
  process.exit(1)
}

/**
iface {
  ip: '169.254.122.122',
  buddyIp: '169.254.51.76',
  mac: '98:e8:fb:51:76:e9',
}
*/

class InterfaceMonitor extends EventEmitter {
  constructor () {
    super()
    this.maxAddr = [100, 100]
    this.mon = udev.monitor('net')
    this.mon.on('add', dev => {
      if (this.isBackus(dev)) {
        const iface = this.createIface(dev)
        this.ifaces.push(iface)
        this.ifup(iface)
      }
    })

    this.mon.on('remove', dev => {
      if (this.isBackus(dev)) {
        const idx = this.ifaces.findIndex(iface => iface.name === dev.ID_NET_NAME_MAC)
        if (idx !== -1) {
          const iface = this.ifaces[idx]
          this.ifaces = [...this.ifaces.slice(0, idx), ...this.ifaces.slice(idx + 1)]
          this.emit('remove', iface)
        }
      }
    })
    this.init()
  }

  isBackus (dev) {
    return dev.SUBSYSTEM === 'net' &&
        dev.ID_USB_DRIVER === 'rndis_host' &&
        dev.ID_VENDOR === 'Shanghai_Dingnan_Co.__Ltd' &&
        /^enx[0-9a-f]{12}$/.test(dev.ID_NET_NAME_MAC)
  }

  createIface (dev) {
    const n = dev.ID_NET_NAME_MAC
    const mac = `${n.slice(3, 5)}:${n.slice(5, 7)}:${n.slice(7, 9)}:${n.slice(9, 11)}:${n.slice(11, 13)}:${n.slice(13, 15)}`
    const buddyIp = `169.254.${parseInt(n.slice(9, 11))}.${parseInt(n.slice(11, 13))}`
    return { name: n, mac, buddyIp }
  }

  init () {
    this.ifaces = udev.list()
      // .filter(dev => dev.SUBSYSTEM === 'net')
      // .map(dev => (blog.log(dev), dev))
      .filter(dev => this.isBackus(dev))
      // .map(dev => (blog.log(dev), dev))
      .map(dev => this.createIface(dev))

    const ifaceObj = os.networkInterfaces()
    // blog.log(ifaceObj)
    for (const key in ifaceObj) {
      const iface = this.ifaces.find(iface => iface.name === key)
      // blog.log('found', iface)
      if (iface) {
        const ipv4 = ifaceObj[key].find(o => o.family === 'IPv4')
        if (ipv4 && ipv4.address.startsWith('169.254')) {
          const n3 = parseInt(ipv4.address.split('.')[2])
          if (this.maxAddr[0] <= n3) this.maxAddr[0] = n3 + 1
        }
      }
    }

    this.ifaces.forEach(iface => {
      blog.log(`network interface found ${iface.name}, mac: ${iface.mac}`)
      this.ifdown(iface)
    })
  }

  ifdown (iface) {
    blog.log(`ifdown ${iface.name}`)
    child.exec(`ifconfig ${iface.name} down`, err => {
      if (this.ifaces.includes(iface)) {
        if (err) {
          iface.error = err
        } else {
          this.ifup(iface)
        }
      }
    })
  }

  ifup (iface) {
    const n3 = this.maxAddr[0]
    const n4 = this.maxAddr[1]
    if (n4 === 254) {
      this.maxAddr[0] = this.maxAddr[0] + 1
      this.maxAddr[1] = 100
    } else {
      this.maxAddr[1] = this.maxAddr[1] + 1
    }

    blog.log(`ifup ${iface.name}，host address: 169.254.${n3}.${n4}，device address: ${iface.buddyIp}`)
    child.exec(`ifconfig ${iface.name} 169.254.${n3}.${n4} netmask 255.255.0.0`, err => {
      if (this.ifaces.includes(iface)) {
        if (err) {
          iface.error = err
        } else {
          child.exec(`route add -host ${iface.buddyIp} dev ${iface.name}`, err => {
            if (this.ifaces.includes(iface)) {
              if (err) {
                iface.error = err
              } else {
                iface.ip = `169.254.${n3}.${n4}`
                this.emit('add', iface)
              }
            }
          })
        }
      }
    })
  }
}

module.exports = new InterfaceMonitor()
