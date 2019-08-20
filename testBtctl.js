const Bluetoothctl = require('./bluetooth/bluetoothctl')
const Gatt = require('./bluetooth/gatt')

const monitor = new Bluetoothctl()
monitor.once('prompt', prompt => {
  monitor.send('scan on', null, lines => {
    console.log('scan on unsolicited lines', lines)
    monitor.send('devices', lines => {
      console.log(lines)
      const gatt = new Gatt() 
    }, lines => {
      console.log(lines)
    })
  })
})

