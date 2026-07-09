import { describe, expect, it } from "vitest";

import {
  cn,
  escapePostgrestOrValue,
  formatDistanceMeters,
  formatFileSize,
  getInitials,
  slugify,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("Avi Perdana")).toBe("AP");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("budi santoso")).toBe("BS");
  });

  it("handles a single name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("ignores extra whitespace between words", () => {
    expect(getInitials("  Siti   Rahayu  ")).toBe("SR");
  });

  it("ignores a third+ word", () => {
    expect(getInitials("Andi Wijaya Kusuma")).toBe("AW");
  });
});

describe("formatDistanceMeters", () => {
  it("renders null as a dash", () => {
    expect(formatDistanceMeters(null)).toBe("-");
  });

  it("renders sub-kilometer distances in meters, rounded", () => {
    expect(formatDistanceMeters(42.6)).toBe("43 m");
    expect(formatDistanceMeters(0)).toBe("0 m");
  });

  it("renders distances at or above 1000m in kilometers", () => {
    expect(formatDistanceMeters(1000)).toBe("1.0 km");
    expect(formatDistanceMeters(2350)).toBe("2.4 km");
  });
});

describe("formatFileSize", () => {
  it("renders nullish input as a dash", () => {
    expect(formatFileSize(null)).toBe("-");
    expect(formatFileSize(undefined)).toBe("-");
    expect(formatFileSize(0)).toBe("-");
  });

  it("renders bytes with no decimal", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("renders kilobytes with one decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("renders megabytes and gigabytes correctly", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Head Office Kendari")).toBe("head-office-kendari");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("Finance & Accounting!!")).toBe("finance-accounting");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Marketing--  ")).toBe("marketing");
  });
});

describe("escapePostgrestOrValue", () => {
  it("wraps the value in double quotes", () => {
    expect(escapePostgrestOrValue("hello")).toBe('"hello"');
  });

  it("escapes internal double quotes", () => {
    expect(escapePostgrestOrValue('a"b')).toBe('"a\\"b"');
  });

  it("escapes backslashes before quoting (order matters)", () => {
    expect(escapePostgrestOrValue("a\\b")).toBe('"a\\\\b"');
  });

  it("neutralizes a PostgREST filter-injection attempt", () => {
    // A naive interpolation of this raw string into `.or(\`col.ilike.${term}\`)`
    // would inject a second clause. Escaped, it must stay a single literal value.
    const malicious = '%x%,role_key.eq.super_admin,full_name.ilike.%';
    const escaped = escapePostgrestOrValue(malicious);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
    // No unescaped comma should exist outside the quoted literal.
    expect(escaped).toBe(`"${malicious}"`);
  });
});
