const child = require('child_process')
const readline = require('readline')

const wdebug = require('debug')('winasd')
const request = require('superagent')

const im = require('./lib/iface-monitor')
// const ble = require('./lib/bluetooth') 
const Bluetooth = require('./bluetooth')
const Restriction = require('./lib/restriction')

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

  r.once('winasd', () => {
    const winasd = child.spawn('ssh', [...sshArgs, `root@${ip}`, 'node /root/winasd/src/app.js'])
    const rl = readline.createInterface({ input: winasd.stdout })
    // process.nextTick(() => r.send(rl))
    rl.on('line', l => wdebug(l))
  }) 

  r.once('blueAddr', () => getBlueAddr(ip, (err, addr) => err 
    ? console.log(`${ip} blueAddr err: ${err.message}`) 
    : r.send('blueAddr', addr)))

  r.once('blueInfo', () => 
    r.recv('blueAddr', baddr => 
      ble.deviceInfo(baddr, (err, info) => {
        if (err) {
        } else {
          console.log(info)
        }
      })))

//      ble.request({ op: 'info', addr }, (err, info) => err
//         ? console.log('failed to retrieve bluetooth device info')
//        : r.send('blueInfo', info))))

/**
  r.once('blueToken', () => 
    r.recv('blueAddr', addr => 
      ble.request({ op: 'auth', token }, (err, 
*/

  // check info
  r.recv('blueInfo', info => {
    console.log(info)
  })

  r.recv('blueToken', token => {
    console.log(token)
  })

  r.recv('winasd', winasd => {
    winasd.on('line', line => {
      wdebug(line)
    })
  })
})

