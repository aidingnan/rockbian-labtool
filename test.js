const Bluetoothctl = require('./bluetooth/bluetoothctl')
const GattClient = require('./bluetooth/gatt-client')

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

const main = new Bluetoothctl(mainOpts)

const DEVICE_ADDR = 'CC:4B:73:3D:0C:31' 

main.on('scan', () => {
  main.devices((err, devices) => {
    if (err) throw err
    
    let device = devices.find(dev => dev.addr === DEVICE_ADDR)
    if (!device) {
      throw new Error(`device ${DEVICE_ADDR} not found`)
    } else {
      main.deviceInfo(DEVICE_ADDR, (err, info) => {
        if (err) {
          throw err
        } else {

          const gatt = new GattClient({
            name: info.name,
            addr: DEVICE_ADDR,
            services: [
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
          })

          gatt.on('ready', () => {
            gatt.request('auth', { action:'req', seq:1 }, (err, res) => {
              if (err) {
                console.log(err)
              } else {
                console.log(res)
              }
            })
          })
        }
      })
    }
  })
})
