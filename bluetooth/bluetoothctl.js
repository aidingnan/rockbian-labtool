const EventEmitter = require('events')
const child = require('child_process')

const Debug = require('debug')
const stripAnsi = require('strip-ansi')
const camelCase = require('camelcase')

const stub = lines => console.log('(stub) ' + lines) || true

const parseDeviceInfo = lines => { 
  let regex = new RegExp(`^Device (.*) \\(\(.*\)\\)$`)
  let head = lines[0].match(regex)
  let addr = head[1]
  let type = head[2]
  
  let kvs = []
  lines.filter(l => l.startsWith('\t') || l.startsWith(' '))
    .forEach(l => {
      if (l.startsWith('\t')) {
        let [k, v] = l.split(':').map(x => x.trim())
        kvs.push([k, v.length ? v : []])
      } else if (l.startsWith('  ')) {
        let hex = l.slice(0, 50)
          .split(' ')
          .filter(x => x.length)
          .join('')
        kvs[kvs.length - 1][1].push(Buffer.from(hex, 'hex'))
      }
    })

  return kvs.reduce((o, [k, v]) => {
    if (k === 'UUID') {
      let uuid = v.match(/\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)$/)
      if (uuid) {
        if (o.uuids) {
          o.uuids.push(uuid[1])
        } else {
          o.uuids = [uuid[1]]
        }
      }
    } else if (Array.isArray(v)) {
      o[camelCase(k)] = Buffer.concat(v)
    } else {
      o[camelCase(k)] = v
    }
    return o
  }, { addr, type })
}

/*
four line -> service, or characteristic, or descriptor
*/
const parseAttributes = lines => {
  const services = []

  while (lines.length) {
    const last = arr => arr[arr.length - 1]

    let type = lines.shift()
    let path = lines.shift().trim()
    let uuid = lines.shift().trim()
    let what = lines.shift().trim()

    if (type === 'Primary Service') {
      services.push({ uuid, path, what, characteristics: [] })
    } else if (type === 'Characteristic') {
      last(services).characteristics.push({ uuid, path, what })
    } else if (type === 'Descriptor') {
      last(last(services).characteristics).descriptor = { uuid, path, what }
    } else {
      throw new Error('unknown things')
    }
  }

  return services
}


/**
Bluetoothctl supports three roles:

1. scanner, the scanner sitting in main menu, responsible for device list and device info
2. gatt, maintains a gatt connection 
3. attribute, either as a value source (read-notify) or a value sink (write-read)

bluetoothctl outputs in blocks



"scan on\n[pan-8785]# \rDiscovery started\n[pan-8785]# "

'\r\r[.*]# ' when connected
'\n\r[.*]# ' when path changed
'\n[.*]# ' when 
*/
class Bluetoothctl extends EventEmitter {
  // opts.log
  constructor (opts = {}) {
    super()
    let { 
      name,             // optional
      suffix,           // optional
      role,             // scan, gatt, or char
      powerCycle,       // true or false for scan 
      addr,             // bluetooth addr
      serviceUUID,      // 
      charUUID,         //
      charType,         // sink (write) or source (notify), both support read in backus
      log,              // string or object
    } = opts 

    this.name = name || addr || 'bluetoothctl'
    this.suffix = suffix || ''

    this.debug = Debug(`${this.name}${this.suffix}`)
  
    if (!['scan', 'gatt', 'char'].includes(role)) throw new Error('no role')
    this.role = role

    if (role === 'scan') this.powerCycle = powerCycle

    if (['gatt', 'char'].includes(role) && !addr) throw new Error('no addr')
    this.addr = addr

    if (role === 'char') {
      if (!serviceUUID) throw new Error('no serviceUUID')
      if (!charUUID) throw new Error('no charUUID')
      if (charType !== 'sink' && charType !== 'source') throw new Error('bad charType')
      this.serviceUUID = serviceUUID
      this.charUUID = charUUID
      this.charType = charType
    }

    if (log === 'all') {
      this.logOpt = {
        cmd: true,
        raw: true
      }
    } else {
      this.logOpt = log || {}
    }

    this.menu = 'main'
    this.prompt = ''
    this.str = ''
    this.last = ''      // for quirks
    this.lastSeq = ''   // for duplicate message

    // fake first command
    this.cmds = [{ cmd: 'Agent registered', sync: () => {} }]

    this.ctl = child.spawn('bluetoothctl')
    this.ctl.stdout.on('data', data => this.handle(data))

    switch (this.role) {
      case 'scan':
        this.startScanRole()
        break
      case 'gatt':
        this.startGattRole()
        break
      case 'char':
        this.startCharRole()
        break
      default:
        break
    }
  }

  log (type, data) {
    this.debug(`${type}:`, data)
  }

  handle (data) {
    const append = stripAnsi(data.toString())
    this.str += append
    if (this.logOpt.raw) this.log('raw', JSON.stringify(this.str))

    let m
    while (m = this.str.match(new RegExp('(\n|\n\r|\r\r)\\[(.*)\\]# '), 's')) {
      if (this.prompt !== m[2]) {
        this.prompt = m[2]
        this.emit('prompt', m[2])
      }

      /**
      m[0] full token
      m[1] line-feed / carriage return \n, \n\r, or \r\r
      m[2] prompt string
      */
      const s = this.str.slice(0, m.index) 
      if (s.length === 0) {
        // bypass empty block
      } else if (s.startsWith('\r')) { // async
        const s1 = s.slice(1) 

        // ignore [xxx], space or tab indented 
        if (s1.startsWith('[') || s1.startsWith('  ')) {
          if (s1.startsWith('[')) {
            if (this.unsolicited) {
              if (this.logOpt.unsol) {
                console.log(this.unsolicited)
              }
              this.handleUnsolicited()
            }
            this.unsolicited = { line: s1 }
          } else {
            let buf = Buffer.from(s1.slice(2, 49).trim().split(' ').join(''), 'hex')
            if (this.unsolicited.buf) {
              this.unsolicited.buf = Buffer.concat([this.unsolicited.buf, buf])
            } else {
              this.unsolicited.buf = buf
            }
          }
        } else {
          if (!this.cmds.length) {
            console.log('vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv')
            console.log(JSON.stringify(this.str))
            console.log('--------------------------------------------------')
            console.log(JSON.stringify(s))
            console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^') 
            const msg = 'async message arrived when command queue empty'
            this.emit('error', new Error(msg))
          } else {
            const { cmd, async } = this.cmds[0]
            if (async && !async(s1.split('\n'))) {
              this.last = this.cmds.shift()
              if (this.logOpt.cmd) {
                this.log('cmd', `${cmd} finished`)
              }
              if (this.cmds.length) this.send()
            }
          }
        }
      } else { // sync, including empty string
        if (!this.cmds.length) {
          if (s === this.last.cmd) {
          } else {
            const msg = 'sync message arrived when command queue empty'
            console.log('vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv')
            console.log(JSON.stringify(this.str))
            console.log('--------------------------------------------------')
            console.log(JSON.stringify(s))
            console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^') 
            this.emit('error', new Error(msg))
          }
        } else {
          const lines = s.split('\n')
          const { cmd, sync } = this.cmds[0]
          if (cmd !== lines[0]) {
            if (cmd === 'Agent registered') {
              // silent drop
            } else {
              console.log('vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv')
              console.log(JSON.stringify(this.str))
              console.log('--------------------------------------------------')
              console.log(JSON.stringify(s))
              console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^') 
              const msg = `sync message "${lines[0]}" does not match command "${cmd}"`
              this.emit('error', new Error(msg)) 
            }
          } else {
            if (sync && !sync(s.split('\n').slice(1))) {
              this.last = this.cmds.shift()
              if (this.logOpt.cmd) {
                this.log('cmd', `${cmd} finished`)
              }
              if (this.cmds.length) this.send()
            }
          }
        }
      }

      this.str = this.str.slice(m.index + m[0].length)
    } // while
  }

  handleUnsolicited () {
    if (this.role === 'char' && 
      this.charType === 'source' &&
      this.unsolicited.line === `[CHG] Attribute ${this.charPath} Value:`) {
      if (this.logOpt.msg) {
        this.log('msg', `${this.unsolicited.buf.toString()}`)
      }
      
      let msg
      let str = this.unsolicited.buf.toString().trim()
      if (str.length % 2 === 0 && 
        str.slice(0, str.length / 2) === str.slice(str.length / 2)) {
        str = str.slice(str.length / 2)
      }

      try { 
        msg = JSON.parse(str)
        this.emit('message', msg)
      } catch (e) {
        this.emit(e)  
      }
    }
  }

  send () {
    this.ctl.stdin.write(`${this.cmds[0].cmd}\n`)
    if (this.logOpt.cmd) {
      this.log('cmd', `${this.cmds[0].cmd}`)
    }
  }

  push (cmd, sync, async) {
    this.cmds.push({ cmd, sync, async })
    if (this.cmds.length === 1) this.send()
  }

  startScanRole () {
    const next = () => {
      this.scanOn(() => {
        this.scanning = true
        this.emit('scan')
      })
    }

    if (this.powerCycle) {
      this.powerOff(() => this.powerOn(() => next()))
    } else {
      process.nextTick(() => next())
    }
  }

  startGattRole () {
    this.deviceInfo(this.addr, (err, info) => {
      if (err) {
        this.emit('error', err)
      } else {
        this.connect(err => {
          if (err) {
            this.emit('error', err)
          } else {
            this.connected = true
            this.emit('connected')
          }
        })
      }
    })
  }

  startCharRole () {
    this.connect(err => {
      if (err) {
        this.emit('error', err)
      } else {
        this.listAttributes((err, svcs) => {
          if (err) {
            this.emit(err)
          } else {
            let svc = svcs.find(s => s.uuid === this.serviceUUID)
            if (!svc) {
              this.emit('error', new Error(`service ${this.serviceUUID} not found`))
            } else {
              let char = svc.characteristics.find(c => c.uuid === this.charUUID)
              if (!char) {
                this.emit('error', new Error(`char ${this.charUUID} not found`))
              } else {
                this.charPath = char.path
                this.selectAttribute(err => {
                  if (err) {
                    this.emit('error', err)
                  } else {
                    if (this.charType === 'source') {
                      this.notifyOn(err => {
                        if (err) {
                          this.emit('error', err)
                        } else {
                          this.log('***', 'ready')
                          this.ready = true
                          this.emit('ready')
                        }
                      })
                    } else {
                      this.log('***', 'ready')
                      this.ready = true
                      this.emit('ready')
                    }
                  }
                })
              }
            }
          }
        })
      }
    })
  }

  setMenu (name, callback) {
    if (name === 'main') {
      if (this.menu !== 'main') {
        // FIXME
        this.push('back', stub, stub)
      } else {
        process.nextTick(() => callback())
      }
    } else {
      process.nextTick(() => {
        if (this.menu === name) {
          callback()
        } else {
          this.setMenu('main', () => this.push(`menu ${name}`, () => callback())) 
        }
      })
    }
  }

  powerOff (callback) {
    // [], [ 'Changing power off succeeded' ]
    this.setMenu('main', () => this.push('power off', lines => true, lines => callback()))
  }

  powerOn (callback) {
    // [], [ 'Changing power on succeeded' ]
    this.setMenu('main', () => this.push('power on', lines => true, lines => callback()))
  }

  scanOn (callback) {
    // [], [ 'Discovery started' ]
    this.setMenu('main', () => this.push('scan on', lines => true, lines => callback()))
  }

  // api
  devices (callback) {
    const next = () => 
      this.setMenu('main', () => 
        this.push('devices', lines => 
          callback(null, lines.map(l => ({ addr: l.slice(7, 24), name: l.slice(25) })))))

    this.scanning ? next() : this.once('scan', () => next())
  }

  // api for all roles
  deviceInfo (addr, callback) {
    const next = () => 
      this.setMenu('main', () => 
        this.push(`info ${addr}`, lines => 
          callback(null, parseDeviceInfo(lines))))

    this.role === 'scan'
      ? this.scanning 
        ? next() 
        : this.once('scan', () => next())
      : next()
  }

  // internal
  connect (callback) {
    // [ 'Attempting to connect to CC:4B:73:3D:0C:31' ]
    // [ 'Connection successful' ]
    this.push(`connect ${this.addr}`, lines => true, lines => 
      (lines[0] === 'Connection successful' 
        ? callback(null)
        : callback(new Error(lines[0])), false))
  }

  // api, gatt: list-attributes
  listAttributes (callback) {
    this.setMenu('gatt', () => {
      this.push(`list-attributes ${this.addr}`, lines => {
        callback(null, parseAttributes(lines))
      })
    })
  }

  // 
  selectAttribute (callback) {
    this.setMenu('gatt', () => {
      // [] this command change prompt only
      this.push(`select-attribute ${this.charPath}`, () => {
        let tail2 = this.charPath.split('/').slice(-2).join('/')
        if (!this.prompt.endsWith(tail2)) {
          callback(new Error('failed'))
        } else {
          callback(null)
        }
      })
    })
  }

  // possibly failed with [ 'Failed to start notify: org.freedesktop.DBus.Error.NoReply' ]
  notifyOn (callback) {
    // []
    // [ 'Notify started' ]
    let down = 3
    const retry = () => 
      this.push('notify on', () => true, lines => {
        if (lines[0].includes('Notify started')) {
          callback(null)
        } else if (lines[0].includes('Failed to start notify')) {
          console.log(`notify on failed: ${lines[0]}`)
          down-- ? retry() : callback(new Error(lines[0]))
        } else {
          callback(new Error(lines.length ? lines[0] : 'failed'))
        }
      })

    retry()
  }

  // api
  write (obj, callback) {
    let json = JSON.stringify(obj)
    let hexes = Array.from(Buffer.from(json)).map(n => `0x${n.toString(16)}`).join(' ')
    // [ 'Attempting to write /org/bluez/hci0/dev_CC_4B_73_3D_0C_31/service00aa/char00ae' ]
    this.push(`write "${hexes}"`, lines => {
      return true
      if (lines.length && lines[0] === `Attempting to write ${this.charPath}`) {
        callback(null)
      } else {
        let err = new Error(lines.length ? lines[0] : 'failed')
        callback(err)
      }
    }, lines => {
      // [ 'Failed to write: org.bluez.Error.Failed' ]
      if (lines.length && lines[0].includes('Failed to write')) {
        callback(new Error(lines[0]))
      } else {
      
      }
    }) 
  }

  shift () {
    this.cmds.shift()
    if (this.cmds.length) this.send()
  }

  read (callback) {
    this.push('read', lines => {})
  }

}

module.exports = Bluetoothctl
