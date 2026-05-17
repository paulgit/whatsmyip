/**
 * CIDR Lookup Utility
 *
 * Computes CIDR notation from the IP2Location LITE ASN database by reading
 * the IP range boundaries directly from the BIN file.
 *
 * The LITE ASN BIN file stores CIDR data in the CSV format but the
 * ip2location-nodejs library returns "-" for the asCidr field because
 * the column position mapping doesn't align with the LITE database layout.
 * This module works around the limitation by reading ipFrom/ipTo from the
 * matching database record and converting the range to CIDR notation.
 *
 * The IP range-to-CIDR conversion is implemented with pure BigInt arithmetic
 * to avoid the floating-point and 32-bit signed-integer bugs present in
 * ip2location-nodejs's IPTools class, which causes IPs >= 128.0.0.0 to
 * produce 256 individual /32 entries instead of a single /24.
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

"use strict";

const fs = require("fs");
const net = require("net");

/** ASN database file path (set during initialisation) */
let asnDbPath = null;

/**
 * Initialise the CIDR lookup with the path to the ASN database file
 * @param {string} dbPath - Path to the IP2LOCATION-LITE-ASN.BIN file
 */
function initCidrLookup(dbPath) {
  asnDbPath = dbPath;
}

/**
 * Convert a BigInt IP number to dotted-decimal notation (IPv4)
 * @param {bigint} num - IP address as a BigInt
 * @returns {string} Dotted-decimal IP address string
 */
function bigIntToIPv4(num) {
  const n = Number(num & BigInt(0xffffffff));
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

/**
 * Convert a BigInt IP number to IPv6 colon-hex notation
 * @param {bigint} num - IP address as a BigInt
 * @returns {string} IPv6 address string
 */
function bigIntToIPv6(num) {
  const hex = num.toString(16).padStart(32, "0");
  const parts = [];
  for (let i = 0; i < 32; i += 4) {
    parts.push(hex.substring(i, i + 4));
  }
  return parts.join(":");
}

/**
 * Convert an IPv4 address string to a BigInt.
 * @param {string} ip - Dotted-decimal IPv4 address
 * @returns {BigInt} Numeric representation
 */
function ipv4ToBigInt(ip) {
  const parts = ip.split(".");
  return (
    (BigInt(parts[0]) << 24n) |
    (BigInt(parts[1]) << 16n) |
    (BigInt(parts[2]) << 8n) |
    BigInt(parts[3])
  );
}

/**
 * Convert an IPv6 address string to a BigInt.
 * Handles compressed notation with ::
 * @param {string} ip - IPv6 address string
 * @returns {BigInt} Numeric representation
 */
function ipv6ToBigInt(ip) {
  let fullIp = ip;

  // Handle IPv4-mapped IPv6 addresses like ::ffff:192.0.2.1
  const ipv4MappedMatch = fullIp.match(
    /^(?:0*:)*:(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/i,
  );
  if (ipv4MappedMatch) {
    return (0xffffn << 32n) | ipv4ToBigInt(ipv4MappedMatch[1]);
  }

  if (fullIp.includes("::")) {
    const halves = fullIp.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill("0");
    fullIp = [...left, ...middle, ...right].join(":");
  }

  const parts = fullIp.split(":");
  let result = 0n;
  for (const part of parts) {
    result = (result << 16n) | BigInt(parseInt(part, 16));
  }
  return result;
}

/**
 * Convert an IP range (from, to) to a list of CIDR blocks.
 *
 * Uses BigInt arithmetic throughout to avoid the floating-point and 32-bit
 * signed-integer bugs present in the ip2location-nodejs IPTools class
 * (which uses JavaScript Number and bitwise operators that overflow for
 * IPs >= 128.0.0.0).
 *
 * @param {bigint} startIp - Start of the range (inclusive)
 * @param {bigint} endIp - End of the range (inclusive)
 * @param {number} maxBits - 32 for IPv4, 128 for IPv6
 * @returns {string[]} Array of CIDR strings
 */
function ipRangeToCidrList(startIp, endIp, maxBits) {
  const cidrs = [];
  let current = startIp;

  while (current <= endIp) {
    // The maximum block size is limited by alignment of the current IP.
    // Find how many trailing zero bits current has — that determines the
    // largest power-of-2 block that could start here.
    let maxBitsForAlignment;
    if (current === 0n) {
      maxBitsForAlignment = maxBits;
    } else {
      // Count trailing zeros in current
      let temp = current;
      maxBitsForAlignment = 0;
      while ((temp & 1n) === 0n && maxBitsForAlignment < maxBits) {
        maxBitsForAlignment++;
        temp >>= 1n;
      }
    }

    // Also limit by the remaining range size
    const rangeSize = endIp - current + 1n;
    let maxBitsForRange = 0;
    let sizeTemp = rangeSize;
    while (sizeTemp > 1n) {
      maxBitsForRange++;
      sizeTemp >>= 1n;
    }

    // If the range size is not a power of 2, we can't cover it all at once
    // so use the smaller of the two constraints.
    const prefixLen = maxBits - Math.min(maxBitsForAlignment, maxBitsForRange);
    const blockSize = 1n << BigInt(maxBits - prefixLen);

    const networkAddr = current;
    cidrs.push(
      `${maxBits === 32 ? bigIntToIPv4(networkAddr) : bigIntToIPv6(networkAddr)}/${prefixLen}`,
    );

    current += blockSize;
  }

  return cidrs;
}

/**
 * Convert an IP range (from, to) to CIDR notation.
 *
 * Uses pure BigInt arithmetic to avoid the floating-point and 32-bit
 * signed-integer bugs in the ip2location-nodejs IPTools class.
 *
 * @param {string} ipFromStr - Start IP address
 * @param {string} ipToStr - End IP address (inclusive)
 * @param {number} ipType - 4 for IPv4, 6 for IPv6
 * @returns {string|null} CIDR string (e.g., "1.0.0.0/24"), or null on error
 */
function rangeToCidr(ipFromStr, ipToStr, ipType) {
  try {
    if (ipType === 4) {
      const startIp = ipv4ToBigInt(ipFromStr);
      const endIp = ipv4ToBigInt(ipToStr);
      const cidrs = ipRangeToCidrList(startIp, endIp, 32);
      return cidrs.length > 0 ? cidrs.join(", ") : null;
    } else if (ipType === 6) {
      const startIp = ipv6ToBigInt(ipFromStr);
      const endIp = ipv6ToBigInt(ipToStr);
      const cidrs = ipRangeToCidrList(startIp, endIp, 128);
      return cidrs.length > 0 ? cidrs.join(", ") : null;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/**
 * Convert dotted-decimal IPv4 to numeric value
 * @param {string} ip - IPv4 address string
 * @returns {number} Numeric representation
 */
function dot2Num(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return 0;
  return (
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  );
}

/**
 * Convert IPv6 string to BigInt
 * @param {string} ip - IPv6 address string
 * @returns {BigInt} Numeric representation
 */
function ip2No(ip) {
  let fullIp = ip;

  // Handle IPv4-mapped IPv6 addresses like ::ffff:192.0.2.1
  const ipv4MappedMatch = fullIp.match(
    /^(?:0*:)*:(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/i,
  );
  if (ipv4MappedMatch) {
    return BigInt(0xffffn << 32n) | BigInt(dot2Num(ipv4MappedMatch[1]));
  }

  if (fullIp.includes("::")) {
    const halves = fullIp.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill("0");
    fullIp = [...left, ...middle, ...right].join(":");
  }

  const parts = fullIp.split(":");
  let result = BigInt(0);
  for (const part of parts) {
    result = (result << BigInt(16)) | BigInt(parseInt(part, 16));
  }
  return result;
}

/**
 * Read a 32-bit or 128-bit value from a buffer at the given offset
 * @param {number} offset - Byte offset in the buffer
 * @param {Buffer} buffer - The buffer to read from
 * @param {number} firstCol - Size of the IP From field (4 for IPv4, 16 for IPv6)
 * @returns {BigInt} The value as a BigInt
 */
function read32Or128Row(offset, buffer, firstCol) {
  if (firstCol === 4) {
    return BigInt(buffer.readUInt32LE(offset));
  } else {
    let result = BigInt(0);
    for (let i = 0; i < 16; i++) {
      result = result + (BigInt(buffer.readUInt8(offset + i)) << BigInt(i * 8));
    }
    return result;
  }
}

/**
 * Look up CIDR for an IP address from the ASN database
 *
 * Reads the BIN file directly to find the IP range (ipFrom, ipTo) for
 * the record matching the given IP, then converts the range to CIDR.
 *
 * @param {string} ip - IP address to look up
 * @returns {string|null} CIDR string (e.g., "1.0.0.0/24"), or null if not found
 */
function lookupCidr(ip) {
  if (!ip || !asnDbPath) return null;

  let fd;
  try {
    fd = fs.openSync(asnDbPath, "r");
  } catch (_err) {
    return null;
  }

  try {
    // Read the database header (64 bytes at file position 0).
    // The IP2Location BIN format uses 1-based positions internally,
    // but fs.readSync uses 0-based offsets. The header starts at byte 0.
    const headerBuf = Buffer.alloc(64);
    fs.readSync(fd, headerBuf, 0, 64, 0);

    const dbColumn = headerBuf.readUInt8(1);
    const dbCount = headerBuf.readUInt32LE(5);
    const baseAddress = headerBuf.readUInt32LE(9);
    const dbCountIPv6 = headerBuf.readUInt32LE(13);
    const baseAddressIPv6 = headerBuf.readUInt32LE(17);

    // Determine IP type and convert to numeric
    const ipType = net.isIP(ip);
    if (ipType === 0) return null;

    let ipNumber;
    let columnSize;
    let firstCol;
    let searchBase;
    let searchCount;

    if (ipType === 4) {
      ipNumber = BigInt(dot2Num(ip));
      columnSize = dbColumn << 2;
      firstCol = 4;
      searchBase = baseAddress;
      searchCount = dbCount;
    } else if (ipType === 6) {
      ipNumber = ip2No(ip);
      columnSize = 16 + ((dbColumn - 1) << 2);
      firstCol = 16;
      searchBase = baseAddressIPv6;
      searchCount = dbCountIPv6;
    } else {
      return null;
    }

    if (searchCount === 0 || searchBase === 0) return null;

    // Binary search for the matching record
    let low = 0;
    let high = searchCount - 1;
    let foundIpFrom = null;
    let foundIpTo = null;

    while (low <= high) {
      const mid = Math.trunc((low + high) / 2);
      const rowOffset = searchBase + mid * columnSize;

      // Read ipFrom + whole row + next ipFrom.
      // baseAddress and derived offsets are 1-based per the IP2Location BIN format,
      // so subtract 1 to convert to the 0-based offset fs.readSync expects.
      const rowBuf = Buffer.alloc(columnSize + firstCol);
      const bytesRead = fs.readSync(
        fd,
        rowBuf,
        0,
        columnSize + firstCol,
        rowOffset - 1,
      );
      if (bytesRead < columnSize + firstCol) break;

      const fromVal = read32Or128Row(0, rowBuf, firstCol);
      const toVal = read32Or128Row(columnSize, rowBuf, firstCol);

      if (ipNumber >= fromVal && ipNumber < toVal) {
        foundIpFrom = fromVal;
        foundIpTo = toVal;
        break;
      } else if (fromVal > ipNumber) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (foundIpFrom === null) return null;

    // Convert ipFrom and ipTo to IP strings
    const ipFromStr =
      ipType === 4 ? bigIntToIPv4(foundIpFrom) : bigIntToIPv6(foundIpFrom);

    // ipTo is the start of the next record; the actual end of the range is ipTo - 1
    const ipToEnd = foundIpTo - BigInt(1);
    const ipToStr =
      ipType === 4 ? bigIntToIPv4(ipToEnd) : bigIntToIPv6(ipToEnd);

    // Convert the IP range to CIDR notation
    return rangeToCidr(ipFromStr, ipToStr, ipType);
  } catch (_err) {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch (_e) {
      // Ignore close errors
    }
  }
}

module.exports = {
  initCidrLookup,
  lookupCidr,
  // Exported for testing
  ipv4ToBigInt,
  ipv6ToBigInt,
  bigIntToIPv4,
  bigIntToIPv6,
  ipRangeToCidrList,
  rangeToCidr,
};
