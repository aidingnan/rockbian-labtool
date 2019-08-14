// Don't ask why it is named Restriction, I'll explain later.
// This is a toy version
// This object holds a collection of named values
// Each value can be set once and only once, via send
// Each value can be also be received, via recv, with a function f as last parameter
// When recv called:
// 1. if single name provided
//    1. if the named value is ready, f(value) is called *synchronously*
//    2. if the value is not ready, the function will be queued until the value is ready
// 2. if multiple name provided, this is considered to be a polling (one-win) logic
//    1. if some of the named value is ready, the first one (in the order of argument
//       list) will be called with given function, f(firstname, value)
//    2. if none of the named value is ready, the function will be queue until the
//       the first named value arrived
class Restriction {
  constructor () {
    this.vs = {}
    this.fmap = {}
  }

  send (name, value) {
    if (Object.prototype.hasOwnProperty.call(this.vs, name)) {
      throw new Error(`value for name "${name}" already sent`)
    } else {
      this.vs[name] = value
      if (this.fmap[name]) {
        const arr = Array.from(this.fmap[name])
        const multi = arr.map(m => false)
        delete this.fmap[name]
        for (var name in this.fmap) arr.forEach((f, i) => multi[i] |= this.fmap[name].delete(f))
        arr.forEach((f, index) => multi[index] ? f(name, value) : f(value))
      }
    }
  }

  // ES6 rest args, the last one must be a function
  // recv (name1, name1, ...., f)
  recv (...names) {
    const f = names.pop()
    const name = names.find(n => Object.prototype.hasOwnProperty.call(this.vs, n))
    if (name) {
      names.length === 1 ? f(this.vs[name]) : f(name, this.vs[name])
    } else {
      names.forEach(name => {
        if (!Object.prototype.hasOwnProperty.call(this.fmap, name)) this.fmap[name] = new Set()
        this.fmap[name].add(f)
      })
    }
  }
}

module.exports = Restriction
