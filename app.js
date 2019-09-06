const child = require('child_process')
const readline = require('readline')

const wdebug = require('debug')('winasd')
const request = require('superagent')

const im = require('./lib/iface-monitor')
const Bluetooth = require('./bluetooth')
const Restriction = require('./lib/restriction')

const { channel, racer } = require('./lib/pi')

const getBlueAddr = (ip, callback) => {
  const c = child.spawn('ssh', ['-o', 'StrictHostKeyChecking no', `root@${ip}`, 'hcitool dev'])
  const chunks = []
  c.stdout.on('data', data => chunks.push(data))
  c.stdout.on('close', () => {
    let lines = Buffer
      .concat(chunks)
      .toString()
      .split('\n')
      .filter(l => l.includes('hci0'))

    if (lines.length !== 1) return
    let addrs = lines[0]
      .split('\t')
      .filter(x => /^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/.test(x))

    if (addrs.length !== 1) return
    callback(null, addrs[0])
  })
}

const g = new Restriction()
g.once('token', () => 
  request
    .get('https://aws-cn.aidingnan.com/c/v1/user/password/token')
    .query({ 
      username: '15618429080', 
      password: '6GeKongGe',
      clientId: '123456',
      type: 'pc'
    }) 
    .then(res => g.send('token', res.body.data.token))
    .catch(e => console.log('failed to retrieve cloud token')))

g.once('encryptedMe', () => 
  g.recv('token', token => 
    request
      .post('https://aws-cn.aidingnan.com/c/v1/user/encrypted')
      .set('Authorization', token)
      .then(res => g.send('encryptedMe', res.body.data.encrypted))
      .catch(e => console.log('failed to retrieve encrypted me', e))))

g.recv('encryptedMe', data => {
  console.log('encrypted me:', data)
})

const sshArgs = ['-o', 'StrictHostKeyChecking no', '-tt']

const ble = new Bluetooth()

// aggressive version
class Reducer {
  // the last one is a node function 
  constructor (...args) {
    this.producer = args.pop()
    this.depends = args
    this.consumers = []
    this.state = 'idle'
  }

  on (f) {
    if (typeof f !== 'function') throw new Error('invalid function')
    if (Object.prototype.hasOwnProperty.call(this, 'data') ||
      Object.prototype.hasOwnProperty.call(this, 'error')) {
      f()
    } else {
      this.consumers.push(f)
      if (this.consumers.length === 1) {
        const next = () => this.producer((err, data) => {
          if (err) {
            this.error = err 
          } else {
            this.data = data
          } 
          this.consumers.forEach(f => f())
        })

        let count = this.depends.length
        if (count) {
          this.depends.forEach(r => r.on(() => (!--count) && next()))
        } else {
          next()
        }
      }
    }
  }
}

const reducer = (...args) => new Reducer(...args)

const some = (...rs) => {
  let next = rs.pop() 
  let fired = false
  let f = x => !fired && (fired = true, next(x))
  rs.forEach(r => r.on(f))
}

// all finished
const every = (...rs) => {
  let next = rs.pop()
  let arr = rs.map(r => undefined)
  let count = rs.length 
  rs.forEach((r, i) => r.on(x => (arr[i] = x, (!--count) && next(...arr))))
}
  
im.on('add', iface => {
  const ip = iface.buddyIp
  const winasd = reducer(callback => 
    child.exec(`scp -o "StrictHostKeyChecking no" scripts/kill root@${ip}:/run`, (err, stdout, stderr) => {
      if (err) console.log('warning: failed to kill previous node processes')
      child.exec(`ssh -o "StrictHostKeyChecking no" root@${ip} bash /run/kill`, (err, stdout, stderr) => {
        const winasd = child.spawn('ssh', [...sshArgs, `root@${ip}`, 'node /root/test/src/app.js'])
        const rl = readline.createInterface({ input: winasd.stdout })
        // delay for a while
        setTimeout(() => callback(null, rl), 2000)
      })
    }))

  const baddr = reducer(callback => getBlueAddr(ip, callback))
  const binfo = reducer(baddr, callback => ble.deviceInfo(baddr.data, callback))
  const color = reducer(winasd, callback => {
    const colorPicker = line => {
      if (line.includes('alwaysOn') || line.includes('breath')) {
        winasd.data.removeListener('line', colorPicker)
        let color = [ line.match(/#[0-9a-f]{6}/g)[0], line.match(/(alwaysOn|breath)/g)[0] ]
        callback(null, color)
      }
    }
    winasd.data.on('line', colorPicker)
  })

  const requestToken = reducer(baddr, callback => {
    ble.request(baddr.data, 'auth', { action: 'req', seq: 1 }, err => {
      callback(null)
    })
  })

  const btoken = reducer(baddr, color, requestToken, callback => {
    ble.request(baddr.data, 'auth', { action: 'auth', seq: 2, body: { color: color.data }}, (err, res) => 
      err ? callback(err) : callback(null, res.data.token))
  })

  winasd.on(() => winasd.data.on('line', line => wdebug(line))) 

  btoken.on(() => console.log('--------------------------------', btoken.data))


})

