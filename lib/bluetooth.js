const EventEmitter = require('events')
const child = require('child_process')
const readline = require('readline')

const debug = require('debug')('ble')
const camelCase = require('camelcase')

const strip = str => str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '')
const min = (a, b) => a < b ? a : b
const max = (a, b) => a > b ? a : b

const parseAttributes = buf => {
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
Readline expects 
1. either a last line and a prompt rest, (timeout) 
2. or any last line with a prompt reset timeout
3. a free message listener
*/
class Readline extends EventEmitter {
  constructor () {
    super() 
    this.btctl = child.spawn('bluetoothctl')
    this.state = 'idle'
    this.buf = Buffer.alloc(0)
  }

  send (cmd, opts, callback) {
    debug('command:', cmd || '(empty)')
    if (this.state !== 'idle') {
      return process.nextTick(() => callback(new Error('bad state')))
    }

    if (cmd) this.btctl.stdin.write(`${cmd}\n`)
    let lines = []

    let timer

    const handler = data => {

      if (typeof opts === 'number') clearTimeout(timer)
      this.buf = Buffer.concat([this.buf, data])
      while (this.buf.length) {
        let idxn = this.buf.indexOf('\n')
        let idxr = this.buf.indexOf('\r')
        let idx = (idxn > -1 && idxr > -1) ? min(idxn, idxr) : max(idxn, idxr)        
        if (idx === -1) {
          let rest = strip(this.buf.toString())
          if (rest.match(/^\[.*\]# $/)) {
            if (typeof opts === 'number') {
              timer = setTimeout(() => {
                this.state = 'idle'
                this.btctl.stdout.removeListener('data', handler)
                callback(null, lines)
              }, opts)
            } else if (typeof opts === 'string') {
              if (lines.find(l => l.includes(opts))) {
                this.state = 'idle'
                this.btctl.stdout.removeListener('data', handler)
                callback(null, lines)
              }
            } else if (Array.isArray(opts)) {
              if (lines.find(l => l.includes(opts[0]))) {
                this.state = 'idle'
                this.btctl.stdout.removeListener('data', handler)
                callback(null, lines)
              } else if (lines.find(l => l.includes(opts[1]))) {
                this.state = 'idle'
                this.btctl.stdout.removeListener('data', handler)
                let err = new Error('failed')
                err.code = 'EFAIL'
                callback(err)
              }
            } else {
              this.state = 'idle'
              this.btctl.stdout.removeListener('data', handler)
              callback(null, lines)
            }
          } else {
            console.log('rest not matching:', rest)
          }
          break
        } else {
          let line = strip(this.buf.slice(0, idx).toString())
          this.buf = this.buf.slice(idx + 1)

          // discard prompt line
          if (line.match(/^\[.*\]# /)) continue
          lines.push(line)
          // console.log('line:', line)
        }
      }
    }

    this.btctl.stdout.on('data', handler)
  }

  open () {
  }

  close () {
  }
}

class State extends EventEmitter {
  constructor (ctx, ...args) {
    super ()
    this.ctx = ctx
    this.handler = cline => {
      let line = strip(cline)
      if (line.match(/^\[.*\]#/)) return         // skip prompt
      if (line.match(/^\[[A-Z]{3}\].*/)) return  // skip message
      this.handle(line)
    }
    ctx.rl.on('line', this.handler)
  }

  setState (NextState, ...args) {

    this.exit()
    debug(`${this.constructor.name} exited`)
    this.ctx.state = new NextState(this.ctx, ...args)
    debug(`entering ${NextState.name}`)
    this.ctx.state.enter()
  }

  enter () {
  }

  exit () {
    this.ctx.rl.removeListener('line', this.handler)
  }

  write (input) {
    this.ctx.btctl.stdin.write(`${input}\n`)
  }

  send (cmd, expect, callback) {
    this.ctx.btctl.stdin.write(`${cmd}\n`)
    
  }

  handle (line) {
    throw new Eror('handle not overridden')
  }

  resume () {
  }
}

class Init extends State {
  enter () {
    this.ctx.rl.send(null, 'Agent registered', err => {
      if (err) return console.log(err)
      this.ctx.rl.send('power off', 'Changing power off succeeded', err => {
        if (err) return console.log(err)
        this.ctx.rl.send('power on', 'Changing power on succeeded', err => {
          if (err) return console.log(err)
          this.ctx.rl.send('menu scan', 'Print evironment variables', err => {
            if (err) return console.log(err)
            this.ctx.rl.send('clear', 'SetDiscoveryFilter success', err => {
              if (err) return console.log(err)
              this.ctx.rl.send('back', 'Print evironment variables', err => {
                this.setState(Main)  
              })
            })
          })
        })
      })
    })
  }
}

class Scan extends State {
  enter () {
    setTimeout(() => {
      this.scanned = false
      this.write('scan on')
      setTimeout(() => {
        this.write('scan off')  
        setTimeout(() => {
          this.setState(List)
        }, 500)
      }, 5000)
    }, 1000)
  }

  handle (line) {}
}

class List extends State {
  enter () {
    let job = this.ctx.jobs[0]
    this.ctx.rl.send('devices', null, (err, lines) => {
      if (err) return console.log(err)
      let devices = lines.map(l => l.slice(7, 24))
      if (devices.find(d => d === job.addr)) {
        job.found = true
      } else {
        job.found = false
      }
      this.setState(Main)
    })
  }

  handle (line) {
    this.lines.push(line)
  }
}

class Main extends State {
  handle (line) {
  }
  enter () {
    if (this.ctx.jobs.length) {
      let job = this.ctx.jobs[0]
      if (!job.hasOwnProperty('found')) {
        this.setState(List)
      } else if (!job.found) {
        console.log(`job addr ${job.addr} not found`)
      } else {
        if (job.op === 'info') {
          this.setState(Info)
        } else if (job.op === 'auth') {
          this.setState(Auth)
        }
      }
    } else {
      this.setState(Idle)
    }
  }
}

class Idle extends State {
  handle (line) {}
  resume () {
    debug('resume, Idle -> Main')
    this.setState(Main)
  }
}

class Info extends State {
  enter() {
    let job = this.ctx.jobs.shift()
    this.ctx.rl.send(`info ${job.addr}`, null, (err, lines) => {
      if (err) {
        job.callback(err)
      } else {
        let regex = new RegExp(`^Device ${job.addr} \\(\(.*\)\\)$`)
        let title = lines[0].trim().match(regex)
        let type = title && title[1]
        
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

        let info = kvs.reduce((o, [k, v]) => {
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
        }, { addr: job.addr, type })
        job.callback(null, info)
      }
      this.setState(Main)
    })
  }

  handle (line) {
    this.lines.push(line)
  }
}

class Auth extends State {
  constructor (ctx) {
    super(ctx)
    let job = this.ctx.jobs.shift()

    this.ctx.rl.send(`connect ${job.addr}`, [
      `ServicesResolved: yes`, 
      `Failed to connect: org.bluez.Error.Failed`
    ], (err, lines) => {
      if (err) return console.log(err)

      this.ctx.rl.send(`menu gatt`, null, (err, lines) => {
        if (err) return console.log(err)
        this.ctx.rl.send(`list-attributes`, null, (err, lines) => {
          if (err) return console.log(err)
          let paths = parseAttributes(lines)
          console.log(paths)
          this.ctx.rl.send(`select-attribute ${paths.authWrite}`, null, (err, lines) => {
            if (err) return console.log(err)
            this.ctx.rl.send('write "0x7b 0x22 0x61 0x63 0x74 0x69 0x6f 0x6e 0x22 0x3a 0x22 0x72 0x65 0x71 0x22 0x2c 0x22 0x73 0x65 0x71 0x22 0x3a 0x31 0x7d"', null, (err, lines) => {
              console.log(err || lines)
              if (err) return console.log(err)
              this.ctx.rl.send(`select-attribute ${paths.authRead}`, null, (err, lines) => {
                if (err) return console.log(err)
                // TODO
                this.ctx.rl.send(`read`, 1000, (err, lines) => {
                  // console.log(err || lines)
                  if (err) return console.log(err)

                  let ds = lines.filter(l => l.startsWith('  '))
                  ds = ds.slice(0, ds.length / 2)  
                  let hex = ds.map(l => l.trim().slice(0, 48).trim().split(' ').join('')).join('')
                  let json = Buffer.from(hex, 'hex') 
                  let obj = JSON.parse(json)
                  let colors = obj.data.colors 

                  colors.forEach((c, i) => console.log(i, c)) 
                  console.log('select color, lord: ')
                  process.stdin.on('data', data => {
                    if (data[0] < 48 || data[0] > 53 || data.length !== 2 || data[1] !== 10) {
                      console.log('select color, load: ')
                    } else {
                      process.stdin.removeAllListeners('data')
                      this.ctx.rl.send(`select-attribute ${paths.authWrite}`, null, (err, lines) => {
                        if (err) return console.log(err)
                        let rep = { action: 'auth', seq: 3, body: { color: colors[data[0] - 48] } }
                        let str = Array.from(Buffer.from(JSON.stringify(rep)))
                          .map(n => '0x' + n.toString(16))
                          .join(' ')

                        this.ctx.rl.send(`write "${str}"`, null, (err, lines) => {
                          if (err) return console.log(err)
                          console.log(lines)
                          this.ctx.rl.send(`select-attribute ${paths.authRead}`, null, (err, lines) => {
                            if (err) return console.log(err)
                            this.ctx.rl.send(`read`, 1000, (err, lines) => {
                              if (err) return console.log(err)

                              let ds = lines.filter(l => l.startsWith('  '))
                              ds = ds.slice(0, ds.length / 2)  
                              let hex = ds.map(l => l.trim().slice(0, 48).trim().split(' ').join('')).join('')
                              let json = Buffer.from(hex, 'hex') 
                              let obj = JSON.parse(json)
                              let token = obj.data.token

                              console.log('token:', token)

                            }) 
                          })
                        })
                      })
                    }
                  })
                })
              })
            })
          })
        })
      })      
    }) 
  }
}

class WriteRead extends State {
  
  constructor (ctx, job) {
    super(ctx)

    this.write(`connect ${job.addr}`)
  }

  handle (line) {
    if (line.includes('Connection successful')) {
      // clear timeout
      
    }
  }
}

class Bluetooth {

  constructor () {
    this.jobs = [
/**
      {
        op: 'info',
        addr: 'CC:4B:73:3D:1C:5F',
        callback: (err, data) => {
          console.log(err || data)
        } 
      }, {
        op: 'auth',
        addr: 'CC:4B:73:3D:1C:5F',
        callback: (err, data) => {
          console.log(err || data)
        }
      }
*/
    ] 

    this.rl = new Readline()
    this.state = new Init(this)
    this.state.enter()
  }

  request (opts, callback) {
    debug(`request ${opts.op}, @ ${this.state.constructor.name}`)
    this.jobs.push(Object.assign({}, opts, { callback }))
    this.state.resume()
  }
}

const bluetooth = new Bluetooth()

module.exports = bluetooth
