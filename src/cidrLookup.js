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
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

"use strict";

const fs = require("fs");
const net = require("net");
const { IPTools } = require("ip2location-nodejs");

const ipTools = new IPTools();

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
 * @param {BigInt} num - IP address as a BigInt
 * @returns {string} Dotted-decimal IP address string
 */
function bigIntToIPv4(num) {
  const n = Number(num & BigInt(0xffffffff));
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

/**
 * Convert a BigInt IP number to IPv6 colon-hex notation
 * @param {BigInt} num - IP address as a BigInt
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
 * Convert an IP range (from, to) to CIDR notation.
 * Uses the IPTools class from ip2location-nodejs for accurate conversion,
 * with a manual fallback for IPv4.
 * @param {string} ipFromStr - Start IP address
 * @param {string} ipToStr - End IP address (inclusive)
 * @param {number} ipType - 4 for IPv4, 6 for IPv6
 * @returns {string|null} CIDR string, or null if conversion fails
 */
function rangeToCidr(ipFromStr, ipToStr, ipType) {
  try {
    if (ipType === 4) {
      const cidrs = ipTools.ipV4ToCIDR(ipFromStr, ipToStr);
      if (cidrs && cidrs.length > 0) {
        return cidrs.join(", ");
      }
    } else if (ipType === 6) {
      const cidrs = ipTools.ipV6ToCIDR(ipFromStr, ipToStr);
      if (cidrs && cidrs.length > 0) {
        return cidrs.join(", ");
      }
    }
  } catch (_err) {
    // Fall through to manual calculation
  }

  // Fallback: manual CIDR calculation for IPv4
  if (ipType === 4) {
    try {
      const from = BigInt(
        ipFromStr
          .split(".")
          .reduce((acc, octet) => (acc << 8n) + BigInt(octet), 0n),
      );
      const to = BigInt(
        ipToStr
          .split(".")
          .reduce((acc, octet) => (acc << 8n) + BigInt(octet), 0n),
      );
      const xor = from ^ to;

      if (xor === 0n) {
        return `${bigIntToIPv4(from)}/32`;
      }

      let prefixLen = 32;
      let temp = xor;
      while (temp !== 0n && prefixLen > 0) {
        prefixLen--;
        temp >>= 1n;
      }

      const networkAddr = from & (0xffffffffn << BigInt(32 - prefixLen));
      return `${bigIntToIPv4(networkAddr)}/${prefixLen}`;
    } catch (_e) {
      return null;
    }
  }

  return null;
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
  const ipv4MappedMatch = fullIp.match(/^(?:0*:)*:(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/i);
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

module.exports = { initCidrLookup, lookupCidr };
