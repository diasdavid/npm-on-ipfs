'use strict'

// the sort of data structure emitted by follow-registry

module.exports = (name, versions) => {
  return {
    seq: 5,
    name: name,
    versions
  }
}
