const child = require('child_process')
const readline = require('readline')

const wdebug = require('debug')('winasd')
const request = require('superagent')

const im = require('./lib/iface-monitor')
const Bluetooth = require('./bluetooth')
const Restriction = require('./lib/restriction')

const pi = require('./lib/pi')
const reducer = pi.reducer

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
  
im.on('add', iface => {
  const ip = iface.buddyIp
  const r = new Restriction()

  // winasd output
  const winasd = reducer(callback => {
    child.exec(`scp -o "StrictHostKeyChecking no" scripts/kill root@${ip}:/run`, (err, stdout, stderr) => {
      if (err) console.log('warning: failed to kill previous node processes')
      child.exec(`ssh -o "StrictHostKeyChecking no" root@${ip} bash /run/kill`, (err, stdout, stderr) => {
        const winasd = child.spawn('ssh', [...sshArgs, `root@${ip}`, 'node /root/winasd/src/app.js'])
        const rl = readline.createInterface({ input: winasd.stdout })
        // delay for a while
        setTimeout(() => callback(null, rl), 3000)
      })
    })
  })

  // bluetooth addr (from ssh)
  const baddr = reducer(callback => getBlueAddr(ip, callback))

  // bluetooth device info
  const binfo = reducer(callback => pi.every(baddr, () => ble.deviceInfo(baddr.data, callback)))

  // auth token
  const btoken = reducer(cb => {
    pi.every(baddr, winasd, () => {
      const color = reducer(callback => {
        const colorPicker = line => {
          if (line.includes('alwaysOn') || line.includes('breath')) {
            winasd.removeListener('line', colorPicker)
            let color = [ line.match(/#[0-9a-f]{6}/g)[0], line.match(/(alwaysOn|breath)/g)[0] ]
            callback(null, color)
          }
        }
        winasd.on('line', colorPicker)
        // TODO timeout
      })

      // forcefully start early
      color.on(() => {})

      ble.request(addr, 'auth', { action: 'req', seq: 1 }, (err, res) => {
        if (err) {
          callback(err)
        } else {
          // { action: 'auth', seq: 3, body: { color: colors[data[0] - 48] } } 
          pi.every(color, () => 
            ble.request(addr, 'auth', { action: 'auth', seq: 2, body: { color }}, (err, res) => {
            if (err) {
              callback(err)
            } else {
              callback(null, res.data.token)
            }
          }))
        }
      })
    })
  })

  // 
  pi.every(baddr, binfo, () => {
    console.log('test every', baddr.data, binfo.data)
  })

  pi.every(winasd, () => {
    winasd.data.on('line', line => console.log(line))
  })


/**
  r.once('blueToken', () => 
    r.recv('blueAddr', addr => r.recv('winasd', winasd => {
      const r2 = new Restriction()
      const colorPicker = line => {
        // console.log('color picker', line)
        if (line.includes('alwaysOn') || line.includes('breath')) {
          winasd.removeListener('line', colorPicker)
          let color = [ line.match(/#[0-9a-f]{6}/g)[0], line.match(/(alwaysOn|breath)/g)[0] ]
          r2.send('color', color)
        }
      }
      winasd.on('line', colorPicker)

      ble.request(addr, 'auth', { action: 'req', seq: 1 }, (err, res) => {
        if (err) {
          console.log('err retrieving blue token') // TODO
        } else {
          // { action: 'auth', seq: 3, body: { color: colors[data[0] - 48] } } 
          r2.recv('color', color => 
            ble.request(addr, 'auth', { action: 'auth', seq: 2, body: { color }}, (err, res) => {
            if (err) {
              console.log('failed to retrieve token', err)
            } else {
              r.send('blueToken', res.data.token)
            }
          }))
        }
      })
    })))

  r.recv('winasd', winasd => winasd.on('line', line => wdebug(line)))
*/
})

