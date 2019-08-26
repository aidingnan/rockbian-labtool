class Channel {
  reduce () {
    if (!this.sendNext || !this.receiveNext) return
    if (this.sendRace && !this.sendRace()) return
    if (this.receiveRace && !this.receiveRace()) return

    this.sendRace && this.sendRace(true)
    this.receiveRace && this.receiveRace(true)

    let rnd = Math.random()
    if (rnd >= 0.5) {
        this.sendNext()
        this.receiveNext(this.data)
    } else {
        this.receiveNext(this.data)
        this.sendNext()
    }
  }

  send (data, next, race) {
    this.data = data
    this.sendNext = next
    this.sendRace = race
    this.reduce()
  }

  receive (next, race) {
    this.receiveNext = next
    this.receiveRace = race
    this.reduce()
  }
}

module.exports = {
  channel: () => new Channel(),
  // racer: (fired = false) => condition => firing => firing ? fired = firing : !fired && condition()
  racer: (fired = false) => () => firing => firing ? fired = firing : !fired
}


