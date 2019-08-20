const EventEmitter = require('events')
const child = require('child_process')
const readline = require('readline')

class Client extends EventEmitter {
  constructor () {
    super()
    this.btctl = child.spanw('bluetoothctl') 
    this.rl =     
  }
}
