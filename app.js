const NetMon = require('./lib/netmon')

let soldiers = []
let logger = {}

const netmon = new NetMon({ soldiers, logger })
netmon.on('iface', iface => console.log(iface))
