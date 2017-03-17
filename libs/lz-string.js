// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// This work is free. You can redistribute it and/or modify it
// under the terms of the WTFPL, Version 2
// For more information see LICENSE.txt or http://www.wtfpl.net/
//
// For more information, the home page:
// http://pieroxy.net/blog/pages/lz-string/testing.html
//
// LZ-based compression algorithm, version 1.4.4

const f = String.fromCharCode
const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
const keyStrUriSafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$'
const baseReverseDic = {}

function getBaseValue (alphabet, character) {
  if (!baseReverseDic[alphabet]) {
    baseReverseDic[alphabet] = {}
    for (let i = 0; i < alphabet.length; i++) {
      baseReverseDic[alphabet][alphabet.charAt(i)] = i
    }
  }
  return baseReverseDic[alphabet][character]
}

const LZString = {
  compressToBase64 (input) {
    if (input == null) return ''
    const res = LZString._compress(input, 6, (a) => keyStrBase64.charAt(a))
    switch (res.length % 4) { // To produce valid Base64
      default: // When could this happen ?
      case 0 : return res
      case 1 : return res + '==='
      case 2 : return res + '=='
      case 3 : return res + '='
    }
  },

  decompressFromBase64 (input) {
    if (input == null) return ''
    if (input === '') return null
    return LZString._decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)))
  },

  compressToUTF16 (input) {
    if (input == null) return ''
    return LZString._compress(input, 15, (a) => f(a + 32)) + ' '
  },

  decompressFromUTF16 (compressed) {
    if (compressed == null) return ''
    if (compressed === '') return null
    return LZString._decompress(compressed.length, 16384, (index) => compressed.charCodeAt(index) - 32)
  },

  // compress into uint8array (UCS-2 big endian format)
  compressToUint8Array (uncompressed) {
    const compressed = LZString.compress(uncompressed)
    const buf = new Uint8Array(compressed.length * 2) // 2 bytes per character

    for (let i = 0, TotalLen = compressed.length; i < TotalLen; i++) {
      const value = compressed.charCodeAt(i)
      buf[i * 2] = value >>> 8
      buf[i * 2 + 1] = value % 256
    }
    return buf
  },

  // decompress from uint8array (UCS-2 big endian format)
  decompressFromUint8Array (compressed) {
    if (compressed === null || compressed === undefined) {
      return LZString.decompress(compressed)
    } else {
      const buf = new Array(compressed.length / 2) // 2 bytes per character
      for (let i = 0, TotalLen = buf.length; i < TotalLen; i++) {
        buf[i] = compressed[i * 2] * 256 + compressed[i * 2 + 1]
      }

      const result = []
      buf.forEach(function (c) {
        result.push(f(c))
      })
      return LZString.decompress(result.join(''))
    }
  },

  // compress into a string that is already URI encoded
  compressToEncodedURIComponent (input) {
    if (input == null) return ''
    return LZString._compress(input, 6, (a) => keyStrUriSafe.charAt(a))
  },

  // decompress from an output of compressToEncodedURIComponent
  decompressFromEncodedURIComponent (input) {
    if (input == null) return ''
    if (input === '') return null
    input = input.replace(/ /g, '+')
    return LZString._decompress(input.length, 32, (index) => getBaseValue(keyStrUriSafe, input.charAt(index)))
  },

  compress: function (uncompressed) {
    return LZString._compress(uncompressed, 16, f)
  },
  _compress: function (uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return ''
    let value
    let dictionary = new Map()
    let dictionaryToCreate = new Map()
    let c = ''
    let wc = ''
    let w = ''
    let enlargeIn = 2 // Compensate for the first entry which should not count
    let dictSize = 3
    let numBits = 2
    let data = []
    let dataVal = 0
    let dataPosition = 0

    for (let ii = 0; ii < uncompressed.length; ii += 1) {
      c = uncompressed.charAt(ii)
      if (!dictionary.has(c)) {
        dictionary.set(c, dictSize++)
        dictionaryToCreate.set(c, true)
      }

      wc = w + c
      if (dictionary.has(wc)) {
        w = wc
      } else {
        if (dictionaryToCreate.has(w)) {
          if (w.charCodeAt(0) < 256) {
            for (let i = 0; i < numBits; i++) {
              dataVal = (dataVal << 1)
              if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0
                data.push(getCharFromInt(dataVal))
                dataVal = 0
              } else {
                dataPosition++
              }
            }
            value = w.charCodeAt(0)
            for (let i = 0; i < 8; i++) {
              dataVal = (dataVal << 1) | (value & 1)
              if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0
                data.push(getCharFromInt(dataVal))
                dataVal = 0
              } else {
                dataPosition++
              }
              value = value >> 1
            }
          } else {
            value = 1
            for (let i = 0; i < numBits; i++) {
              dataVal = (dataVal << 1) | value
              if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0
                data.push(getCharFromInt(dataVal))
                dataVal = 0
              } else {
                dataPosition++
              }
              value = 0
            }
            value = w.charCodeAt(0)
            for (let i = 0; i < 16; i++) {
              dataVal = (dataVal << 1) | (value & 1)
              if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0
                data.push(getCharFromInt(dataVal))
                dataVal = 0
              } else {
                dataPosition++
              }
              value = value >> 1
            }
          }
          enlargeIn--
          if (enlargeIn === 0) {
            enlargeIn = Math.pow(2, numBits)
            numBits++
          }
          dictionaryToCreate.delete(w)
        } else {
          value = dictionary.get(w)
          for (let i = 0; i < numBits; i++) {
            dataVal = (dataVal << 1) | (value & 1)
            if (dataPosition === bitsPerChar - 1) {
              dataPosition = 0
              data.push(getCharFromInt(dataVal))
              dataVal = 0
            } else {
              dataPosition++
            }
            value = value >> 1
          }
        }
        enlargeIn--
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits)
          numBits++
        }
        // Add wc to the dictionary.
        dictionary.set(wc, dictSize++)
        w = String(c)
      }
    }

    // Output the code for w.
    if (w !== '') {
      if (dictionaryToCreate.has(w)) {
        if (w.charCodeAt(0) < 256) {
          for (let i = 0; i < numBits; i++) {
            dataVal = (dataVal << 1)
            if (dataPosition === bitsPerChar - 1) {
              dataPosition = 0
              data.push(getCharFromInt(dataVal))
              dataVal = 0
            } else {
              dataPosition++
            }
          }
          value = w.charCodeAt(0)
          for (let i = 0; i < 8; i++) {
            dataVal = (dataVal << 1) | (value & 1)
            if (dataPosition === bitsPerChar - 1) {
              dataPosition = 0
              data.push(getCharFromInt(dataVal))
              dataVal = 0
            } else {
              dataPosition++
            }
            value = value >> 1
          }
        } else {
          value = 1
          for (let i = 0; i < numBits; i++) {
            dataVal = (dataVal << 1) | value
            if (dataPosition === bitsPerChar - 1) {
              dataPosition = 0
              data.push(getCharFromInt(dataVal))
              dataVal = 0
            } else {
              dataPosition++
            }
            value = 0
          }
          value = w.charCodeAt(0)
          for (let i = 0; i < 16; i++) {
            dataVal = (dataVal << 1) | (value & 1)
            if (dataPosition === bitsPerChar - 1) {
              dataPosition = 0
              data.push(getCharFromInt(dataVal))
              dataVal = 0
            } else {
              dataPosition++
            }
            value = value >> 1
          }
        }
        enlargeIn--
        if (enlargeIn === 0) {
          enlargeIn = Math.pow(2, numBits)
          numBits++
        }
        dictionaryToCreate.delete(w)
      } else {
        value = dictionary.get(w)
        for (let i = 0; i < numBits; i++) {
          dataVal = (dataVal << 1) | (value & 1)
          if (dataPosition === bitsPerChar - 1) {
            dataPosition = 0
            data.push(getCharFromInt(dataVal))
            dataVal = 0
          } else {
            dataPosition++
          }
          value = value >> 1
        }
      }
      enlargeIn--
      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits)
        numBits++
      }
    }

    // Mark the end of the stream
    value = 2
    for (let i = 0; i < numBits; i++) {
      dataVal = (dataVal << 1) | (value & 1)
      if (dataPosition === bitsPerChar - 1) {
        dataPosition = 0
        data.push(getCharFromInt(dataVal))
        dataVal = 0
      } else {
        dataPosition++
      }
      value = value >> 1
    }

    // Flush the last char
    while (true) {
      dataVal = (dataVal << 1)
      if (dataPosition === bitsPerChar - 1) {
        data.push(getCharFromInt(dataVal))
        break
      } else dataPosition++
    }
    return data.join('')
  },

  decompress: function (compressed) {
    if (compressed == null) return ''
    if (compressed === '') return null
    return LZString._decompress(compressed.length, 32768, (index) => compressed.charCodeAt(index))
  },

  _decompress: function (length, resetValue, getNextValue) {
    let dictionary = []
    let enlargeIn = 4
    let dictSize = 4
    let numBits = 3
    let entry = ''
    let result = []
    let w
    let resb
    let c
    let data = {
      val: getNextValue(0),
      position:
      resetValue,
      index: 1
    }

    for (let i = 0; i < 3; i += 1) {
      dictionary[i] = i
    }

    let bits = 0
    let maxpower = Math.pow(2, 2)
    let power = 1
    while (power !== maxpower) {
      resb = data.val & data.position
      data.position >>= 1
      if (data.position === 0) {
        data.position = resetValue
        data.val = getNextValue(data.index++)
      }
      bits |= (resb > 0 ? 1 : 0) * power
      power <<= 1
    }

    switch (bits) {
      case 0:
        bits = 0
        maxpower = Math.pow(2, 8)
        power = 1
        while (power !== maxpower) {
          resb = data.val & data.position
          data.position >>= 1
          if (data.position === 0) {
            data.position = resetValue
            data.val = getNextValue(data.index++)
          }
          bits |= (resb > 0 ? 1 : 0) * power
          power <<= 1
        }
        c = f(bits)
        break
      case 1:
        bits = 0
        maxpower = Math.pow(2, 16)
        power = 1
        while (power !== maxpower) {
          resb = data.val & data.position
          data.position >>= 1
          if (data.position === 0) {
            data.position = resetValue
            data.val = getNextValue(data.index++)
          }
          bits |= (resb > 0 ? 1 : 0) * power
          power <<= 1
        }
        c = f(bits)
        break
      case 2:
        return ''
    }
    dictionary[3] = c
    w = c
    result.push(c)
    while (true) {
      if (data.index > length) {
        return ''
      }

      bits = 0
      maxpower = Math.pow(2, numBits)
      power = 1
      while (power !== maxpower) {
        resb = data.val & data.position
        data.position >>= 1
        if (data.position === 0) {
          data.position = resetValue
          data.val = getNextValue(data.index++)
        }
        bits |= (resb > 0 ? 1 : 0) * power
        power <<= 1
      }

      switch (c = bits) {
        case 0:
          bits = 0
          maxpower = Math.pow(2, 8)
          power = 1
          while (power !== maxpower) {
            resb = data.val & data.position
            data.position >>= 1
            if (data.position === 0) {
              data.position = resetValue
              data.val = getNextValue(data.index++)
            }
            bits |= (resb > 0 ? 1 : 0) * power
            power <<= 1
          }

          dictionary[dictSize++] = f(bits)
          c = dictSize - 1
          enlargeIn--
          break
        case 1:
          bits = 0
          maxpower = Math.pow(2, 16)
          power = 1
          while (power !== maxpower) {
            resb = data.val & data.position
            data.position >>= 1
            if (data.position === 0) {
              data.position = resetValue
              data.val = getNextValue(data.index++)
            }
            bits |= (resb > 0 ? 1 : 0) * power
            power <<= 1
          }
          dictionary[dictSize++] = f(bits)
          c = dictSize - 1
          enlargeIn--
          break
        case 2:
          return result.join('')
      }

      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits)
        numBits++
      }

      if (dictionary[c]) {
        entry = dictionary[c]
      } else {
        if (c === dictSize) {
          entry = w + w.charAt(0)
        } else {
          return null
        }
      }
      result.push(entry)

    // Add w+entry[0] to the dictionary.
      dictionary[dictSize++] = w + entry.charAt(0)
      enlargeIn--

      w = entry

      if (enlargeIn === 0) {
        enlargeIn = Math.pow(2, numBits)
        numBits++
      }
    }
  }
}

module.exports = LZString
