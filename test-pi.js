const { channel, racer } = require('./lib/pi')

const x = channel()
const y = channel()

x.send(1, () => { console.log('1 sent via x') })
y.send(2, () => { console.log('2 sent via y') })

let r = racer()
y.receive(b => console.log(`received ${b} from y`), r())
x.receive(a => console.log(`received ${a} from x`), r())

