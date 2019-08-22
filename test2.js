const Bluetooth = require('./bluetooth')

const ble = new Bluetooth()

ble.devices((err, devices) => {
  // console.log(err || devices)
})

ble.deviceInfo('CC:4B:73:3D:0C:31', (err, info) => {
  // console.log(err || info)
})

ble.request('CC:4B:73:3D:0C:31', 'auth', {
    action: 'req',
    seq: 1
  }, (err, res) => {
    if (err) {
      console.log(err)
    } else if (res.err) {
      console.log(res.err)
    } else {
      console.log(res.data.colors) 
      process.stdin.once('data', data => {
      })
    }
  })

