const EventEmitter = require('events')
const child = require('child_process')

const debug = require('debug')('bctl')
const stripAnsi = require('strip-ansi')

/**
this class is used for test command
*/

const parseAttr = lines => {
  console.log('parseAttributes', JSON.stringify(lines))

  let obj = {}
  while (lines.length) {
    let type = lines.shift() 
    let path = lines.shift().trim()
    let uuid = lines.shift().trim()
    lines.shift() 

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


class Bctl extends EventEmitter {
  constructor () {
    super()
    this.ctl = child.spawn('bluetoothctl')
    
    let str = ''
    this.last = ''
    this.ctl.stdout.on('data', data => {
      str += stripAnsi(data.toString()) 
      let m 
      while (m = str.match(new RegExp('(\n|\n\r|\r\r)\\[(.*)\\]# '), 's')) {
        let s = str.slice(0, m.index)
        if (s === '') {
          console.log('----------------------------------')
          console.log(JSON.stringify(str))
          console.log(m)
          console.log('----------------------------------')
        }
        console.log(`> ${JSON.stringify(s)}`)
        if (!s.startsWith('\r')) this.last = s
        str = str.slice(m.index + m[0].length)

        /**
        m[0] token
        m[1] line-feed / carriage return
        m[2] prompt string
        */
      }
    })
  }

}

const ctl = new Bctl()

const send = (cmd, time = 0) => setTimeout(() => ctl.ctl.stdin.write(`${cmd}\n`), time)

const addr = 'CC:4B:73:3D:0C:31' 

send('power off')
send('power on', 1000)
send('scan on', 3000)
send('scan off', 10000)
send('devices', 11000)
setTimeout(() => console.log(ctl.last), 11100)
send(`connect ${addr}`, 12000)
send('menu gatt', 13000)
send(`list-attributes ${addr}`, 15000)

let attr
setTimeout(() => attr = parseAttr(ctl.last.split('\n').slice(1)), 15100)

setTimeout(() => send(`select-attribute ${attr.authWrite}`), 16000)
setTimeout(() => send(`select-attribute ${attr.authRead}`), 17000)


