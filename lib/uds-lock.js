const net = require('net')

module.exports = (uuid, callback) =>
  net.createServer(c => c.end())
    .on('error', err => callback(err))
    .listen(`/run/${uuid}`, () => callback())


