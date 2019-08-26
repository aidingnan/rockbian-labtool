const EventEmitter = require('events')
const child = require('child_process')
const net = require('net')
const os = require('os')

const debug = require('debug')('iface')
const udev = require('udev')

const routen = require('./routen')

const blog = console

if (!process.getuid || process.getuid() !== 0) {
  console.log('udev requires root priviledge')
  process.exit(1)
}

/**
iface {
  name: 
  ip: '                // ip is set only if routes available
  buddyIp: 
  mac:
}

udev list or monitor creates iface, with name, buddyIp and mac, but not ip.
routen/update or ifup (after `route add` without routen) add ip prop.  
*/
class InterfaceMonitor extends EventEmitter {
  constructor () {
    super()

    const acquireLock = () => 
      net.createServer(c => c.on('error', () => {}))
        .on('error', err => setTimeout(acquireLock, 1000))
        .listen(9964, () => this.activate())

    acquireLock()

    /*
    when lock acquired:
      1. old polling should be aborted if any
      2. routen should be performed once to guarantee all interfaces configured by peers are 
    */
    this.activating = false
    this.activated = false

    this.mon = udev.monitor('net')
    this.mon.on('add', dev => {
      if (this.isBackus(dev)) {
        const iface = this.createIface(dev)
        this.ifaces.push(iface)
        if (this.activated) this.ifup(iface)
      }
    })

    this.mon.on('remove', dev => {
      if (this.isBackus(dev)) {
        const idx = this.ifaces.findIndex(iface => iface.name === dev.ID_NET_NAME_MAC)
        if (idx !== -1) {
          const iface = this.ifaces[idx]
          this.ifaces = [...this.ifaces.slice(0, idx), ...this.ifaces.slice(idx + 1)]
          if (iface.ip) {
            // console.log('remove', iface)
            this.emit('remove', iface)
          }
        }
      }
    })

    this.init()
  }

  activate () {
    // console.log('activate')
    this.activating = true
    routen((err, routes) => {
      if (err) {
        console.log('error', err)
      } else {
        this.update(routes)
        this.ifaces.forEach(iface => !iface.ip && this.ifup(iface))
        this.activated = true
      }
    })
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

  // append ip and routing info to iface 
  update (routes) {

    debug('updating', routes)

    let ni = os.networkInterfaces()
    routes.forEach(r => {
      // link-local only
      if (!r.destination.startsWith('169.254.')) return
      if (r.genmask !== '255.255.255.255') return

      // existing
      let iface = this.ifaces.find(iface => iface.buddyIp === r.destination)
      if (!iface) return              // is this possible ???
      if (iface.ip) return            // already configured
      if (!ni[iface.name]) return

      let ipv4 = ni[iface.name].find(i => i.family === 'IPv4')
      if (!ipv4) return

      iface.ip = ipv4.address
      console.log('add', iface)
      this.emit('add', iface)
    })

    debug('updated', this.ifaces)
  }

  init () {
    this.ifaces = udev.list()
      .filter(dev => this.isBackus(dev))
      .map(dev => this.createIface(dev))

    debug(this.ifaces)

    const poll = () => {
      routen((err, routes) => {
        if (this.activating || this.activated) return
        if (!err) this.update(routes)
        setTimeout(() => {
          if (this.activating || this.activated) return
          poll()
        }, 1000)
      })
    }
    poll()
  }

  ifup (iface) {

    let n3, n4, ip
    do {
      n3 = Math.floor(Math.random() * 155) + 100
      n4 = Math.floor(Math.random() * 155) + 100
      ip = `169.254.${n3}.${n4}` 
    } while (this.ifaces.find(iface => iface.ip === ip))

    debug(`ifup ${iface.name}，host address: ${ip}，device address: ${iface.buddyIp}`)
    child.exec(`ifconfig ${iface.name} ${ip} netmask 255.255.0.0`, err => {
      if (this.ifaces.includes(iface)) {
        if (err) {
          iface.error = err
        } else {
          child.exec(`route add -host ${iface.buddyIp} dev ${iface.name}`, err => {
            if (this.ifaces.includes(iface)) {
              if (err) {
                iface.error = err
              } else {
                iface.ip = ip
                // console.log('add', iface)
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
