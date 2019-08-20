const Bluetoothctl = require('./bluetooth/bluetoothctl')

const localAuthServiceUUID = '60000000-0182-406c-9221-0a6680bd0943'
const localAuthReadCharUUID = '60000002-0182-406c-9221-0a6680bd0943'
const localAuthWriteCharUUID = '60000003-0182-406c-9221-0a6680bd0943'

let mainOpts = {
  name: 'main',
  powerCycle: false,
  role: 'scan',
  log: {
    cmd: true,
  }
}

let gattOpts = {
  name: 'gatt',
  role: 'gatt',
  log: {
    cmd: true
  }
}

const main = new Bluetoothctl(mainOpts)

main.on('scan', () => {
  main.devices((err, devices) => {
    if (err) return
    let dev = devices.find(dev => dev.addr === 'CC:4B:73:3D:0C:31')
    if (!dev) {
      console.log('not found')
    } else {
      main.deviceInfo(dev.addr, (err, info) => {
        console.log(err || info)
        if (err) return
       
        const gatt = new Bluetoothctl({
          name: 'gatt',
          role: 'gatt',
          addr: dev.addr,
          log: { 
            cmd: true 
          }
        })

        gatt.on('connected', () => gatt.listAttributes((err, services) => {
          let la = services.find(svc => svc.uuid === localAuthServiceUUID)
          if (!la) throw new Error('local auth service not found')

          const source = new Bluetoothctl({
            name: 'source',
            addr: gatt.addr,
            role: 'char',
            serviceUUID: localAuthServiceUUID,
            charUUID: localAuthReadCharUUID,
            charType: 'source',
            log: {
              cmd: true,
              msg: true
            }
          })

          source.on('open', () => {
            const sink = new Bluetoothctl({
              name: 'sink',
              addr: gatt.addr,
              role: 'char',
              serviceUUID: localAuthServiceUUID,
              charUUID: localAuthWriteCharUUID,
              charType: 'sink',
              log: {
                cmd: true,
              }
            })
            sink.on('open', () => {
              sink.write({ action:'req', seq:1 }, err => {
                if (err) {
                  console.log(err)
                } else {
                  source.once('message', msg => {
                    console.log(msg)
                  })
                }
              })
            })
          })
        }))
      })
    }
  })
})


