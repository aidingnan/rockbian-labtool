#!/usr/bin/env node

let mode = process.argv.pop()
let color = process.argv.pop()

if (mode !== 'alwaysOn' && mode !== 'breath') {
  console.log('bad mode')
  process.exit(1)
}

const codes = new Map()
codes.set('red', '#ff0000')
codes.set('green', '#00ff00')
codes.set('blue', '#0000ff')
codes.set('white', '#ffffff')

if (!['red', 'green', 'blue', 'white'].includes(color)) {
  console.log('bad color')
  process.exit(1)
}

let rep = { 
  action: 'auth', 
  seq: 3, 
  body: { 
    color: [codes.get(color), mode]
  } 
}

let str = Array.from(Buffer.from(JSON.stringify(rep)))
            .map(n => '0x' + n.toString(16))
            .join(' ')

console.log(str)

