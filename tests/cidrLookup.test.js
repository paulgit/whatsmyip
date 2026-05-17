/**
 * Unit tests for CIDR range calculation
 *
 * Covers the BigInt-based ipRangeToCidrList implementation that replaced
 * the buggy ip2location-nodejs IPTools class (which used JavaScript Number
 * and bitwise operators that overflow for IPs >= 128.0.0.0).
 *
 * @author Paul Git <paulgit@pm.me>
 * @license MIT
 */

import { describe, it, expect } from "vitest";
import {
  ipv4ToBigInt,
  ipv6ToBigInt,
  bigIntToIPv4,
  bigIntToIPv6,
  ipRangeToCidrList,
  rangeToCidr,
} from "../src/cidrLookup.js";

// ---------------------------------------------------------------------------
// IPv4 address ↔ BigInt conversion
// ---------------------------------------------------------------------------

describe("ipv4ToBigInt", () => {
  it("converts 0.0.0.0 to 0n", () => {
    expect(ipv4ToBigInt("0.0.0.0")).toBe(0n);
  });

  it("converts 1.2.3.4 correctly", () => {
    // (1 << 24) | (2 << 16) | (3 << 8) | 4 = 16909060
    expect(ipv4ToBigInt("1.2.3.4")).toBe(16909060n);
  });

  it("converts 255.255.255.255 to max IPv4 value", () => {
    expect(ipv4ToBigInt("255.255.255.255")).toBe(4294967295n);
  });

  it("converts 128.0.0.0 (the boundary that broke the old code)", () => {
    // 128.0.0.0 = 2^31 = 2147483648 — exceeds signed Int32
    expect(ipv4ToBigInt("128.0.0.0")).toBe(2147483648n);
  });

  it("converts 185.194.148.0 (the originally reported bug IP)", () => {
    expect(ipv4ToBigInt("185.194.148.0")).toBe(3116536832n);
  });
});

describe("bigIntToIPv4", () => {
  it("converts 0n to 0.0.0.0", () => {
    expect(bigIntToIPv4(0n)).toBe("0.0.0.0");
  });

  it("round-trips 1.2.3.4", () => {
    expect(bigIntToIPv4(ipv4ToBigInt("1.2.3.4"))).toBe("1.2.3.4");
  });

  it("round-trips 255.255.255.255", () => {
    expect(bigIntToIPv4(ipv4ToBigInt("255.255.255.255"))).toBe(
      "255.255.255.255",
    );
  });

  it("round-trips 185.194.148.222", () => {
    expect(bigIntToIPv4(ipv4ToBigInt("185.194.148.222"))).toBe(
      "185.194.148.222",
    );
  });
});

// ---------------------------------------------------------------------------
// IPv6 address ↔ BigInt conversion
// ---------------------------------------------------------------------------

describe("ipv6ToBigInt", () => {
  it("converts :: to 0n", () => {
    expect(ipv6ToBigInt("::")).toBe(0n);
  });

  it("converts ::1 to 1n", () => {
    expect(ipv6ToBigInt("::1")).toBe(1n);
  });

  it("converts full expanded address", () => {
    expect(ipv6ToBigInt("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      0x20010db8000000000000000000000001n,
    );
  });

  it("converts compressed :: notation", () => {
    expect(ipv6ToBigInt("2001:db8::1")).toBe(
      0x20010db8000000000000000000000001n,
    );
  });

  it("converts IPv4-mapped ::ffff:192.0.2.1", () => {
    const expected = (0xffffn << 32n) | ipv4ToBigInt("192.0.2.1");
    expect(ipv6ToBigInt("::ffff:192.0.2.1")).toBe(expected);
  });
});

describe("bigIntToIPv6", () => {
  it("converts 0n to all-zeros expanded form", () => {
    expect(bigIntToIPv6(0n)).toBe("0000:0000:0000:0000:0000:0000:0000:0000");
  });

  it("round-trips 2001:db8::1", () => {
    const ip = "2001:0db8:0000:0000:0000:0000:0000:0001";
    expect(bigIntToIPv6(ipv6ToBigInt(ip))).toBe(ip);
  });
});

// ---------------------------------------------------------------------------
// ipRangeToCidrList — IPv4 CIDR calculation
// ---------------------------------------------------------------------------

describe("ipRangeToCidrList (IPv4)", () => {
  it("returns a single /32 for a single-host range", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("1.2.3.4"),
      ipv4ToBigInt("1.2.3.4"),
      32,
    );
    expect(result).toEqual(["1.2.3.4/32"]);
  });

  it("returns a single /24 for a full /24 block", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("10.0.0.0"),
      ipv4ToBigInt("10.0.0.255"),
      32,
    );
    expect(result).toEqual(["10.0.0.0/24"]);
  });

  it("returns a single /16 for a full /16 block", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("172.16.0.0"),
      ipv4ToBigInt("172.16.255.255"),
      32,
    );
    expect(result).toEqual(["172.16.0.0/16"]);
  });

  it("returns a single /8 for a full /8 block", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("10.0.0.0"),
      ipv4ToBigInt("10.255.255.255"),
      32,
    );
    expect(result).toEqual(["10.0.0.0/8"]);
  });

  it("returns /0 for the entire IPv4 address space", () => {
    const result = ipRangeToCidrList(0n, 0xffffffffn, 32);
    expect(result).toEqual(["0.0.0.0/0"]);
  });

  // BUG FIX: This is the exact case reported — IPs >= 128.0.0.0 where
  // the old ip2location-nodejs IPTools class produced 256 × /32 instead
  // of one /24, due to JavaScript Number bitwise overflow.
  it("correctly computes /24 for 185.194.148.0/24 (IP >= 128.0.0.0)", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("185.194.148.0"),
      ipv4ToBigInt("185.194.148.255"),
      32,
    );
    expect(result).toEqual(["185.194.148.0/24"]);
  });

  it("handles 128.0.0.0/1 (the signed-Int32 boundary)", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("128.0.0.0"),
      ipv4ToBigInt("255.255.255.255"),
      32,
    );
    expect(result).toEqual(["128.0.0.0/1"]);
  });

  it("decomposes a non-aligned range into minimal CIDRs", () => {
    // 192.168.1.130 – 192.168.1.135
    // 130-131 = /31, 132-135 = /30
    const result = ipRangeToCidrList(
      ipv4ToBigInt("192.168.1.130"),
      ipv4ToBigInt("192.168.1.135"),
      32,
    );
    expect(result).toEqual(["192.168.1.130/31", "192.168.1.132/30"]);
  });

  it("decomposes 10.0.0.1-6 into four CIDRs", () => {
    // 1(/32), 2-3(/31), 4-5(/31), 6(/32)
    const result = ipRangeToCidrList(
      ipv4ToBigInt("10.0.0.1"),
      ipv4ToBigInt("10.0.0.6"),
      32,
    );
    expect(result).toEqual([
      "10.0.0.1/32",
      "10.0.0.2/31",
      "10.0.0.4/31",
      "10.0.0.6/32",
    ]);
  });

  it("handles 192.168.1.128/25 (half of a /24)", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("192.168.1.128"),
      ipv4ToBigInt("192.168.1.255"),
      32,
    );
    expect(result).toEqual(["192.168.1.128/25"]);
  });

  it("handles 254.0.0.0/8 (high IP range)", () => {
    const result = ipRangeToCidrList(
      ipv4ToBigInt("254.0.0.0"),
      ipv4ToBigInt("254.255.255.255"),
      32,
    );
    expect(result).toEqual(["254.0.0.0/8"]);
  });
});

// ---------------------------------------------------------------------------
// ipRangeToCidrList — IPv6 CIDR calculation
// ---------------------------------------------------------------------------

describe("ipRangeToCidrList (IPv6)", () => {
  it("returns a single /128 for a single IPv6 host", () => {
    const start = ipv6ToBigInt("::1");
    const result = ipRangeToCidrList(start, start, 128);
    expect(result).toEqual(["0000:0000:0000:0000:0000:0000:0000:0001/128"]);
  });

  it("returns a /64 for a full /64 range", () => {
    const start = ipv6ToBigInt("2001:db8::");
    const end = ipv6ToBigInt("2001:db8::ffff:ffff:ffff:ffff");
    const result = ipRangeToCidrList(start, end, 128);
    expect(result).toEqual(["2001:0db8:0000:0000:0000:0000:0000:0000/64"]);
  });

  it("returns a /0 for the entire IPv6 address space", () => {
    const result = ipRangeToCidrList(0n, (1n << 128n) - 1n, 128);
    expect(result).toEqual(["0000:0000:0000:0000:0000:0000:0000:0000/0"]);
  });
});

// ---------------------------------------------------------------------------
// rangeToCidr — integration wrapper
// ---------------------------------------------------------------------------

describe("rangeToCidr", () => {
  it("handles IPv4 /24 ranges", () => {
    expect(rangeToCidr("10.0.0.0", "10.0.0.255", 4)).toBe("10.0.0.0/24");
  });

  it("handles the originally reported 185.194.148.0/24 bug", () => {
    expect(rangeToCidr("185.194.148.0", "185.194.148.255", 4)).toBe(
      "185.194.148.0/24",
    );
  });

  it("returns null for unsupported IP type", () => {
    expect(rangeToCidr("1.2.3.4", "1.2.3.4", 0)).toBeNull();
  });

  it("returns null for inverted range (start > end)", () => {
    expect(rangeToCidr("10.0.0.255", "10.0.0.0", 4)).toBeNull();
  });

  it("handles IPv6 single host", () => {
    expect(rangeToCidr("::1", "::1", 6)).toBe(
      "0000:0000:0000:0000:0000:0000:0000:0001/128",
    );
  });
});
