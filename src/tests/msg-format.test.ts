import { describe, expect, test } from "vitest";
import { MSG_DEFAULT_FORMAT } from "@worldware/msg";
import {
  formatToUnitType,
  resolveMessageFormat,
  unitTypeToFormat,
} from "../lib/msg-format.js";

describe("msg-format", () => {
  describe("formatToUnitType", () => {
    test("encodes formats with msg: prefix", () => {
      expect(formatToUnitType("NONE")).toBe("msg:NONE");
      expect(formatToUnitType("MF1")).toBe("msg:MF1");
      expect(formatToUnitType("MF2")).toBe("msg:MF2");
    });
  });

  describe("unitTypeToFormat", () => {
    test("decodes msg: prefixed types", () => {
      expect(unitTypeToFormat("msg:NONE")).toBe("NONE");
      expect(unitTypeToFormat("msg:MF1")).toBe("MF1");
      expect(unitTypeToFormat("msg:MF2")).toBe("MF2");
    });

    test("accepts bare format values for resilience", () => {
      expect(unitTypeToFormat("NONE")).toBe("NONE");
      expect(unitTypeToFormat("MF1")).toBe("MF1");
      expect(unitTypeToFormat("MF2")).toBe("MF2");
    });

    test("returns undefined for missing or unknown types", () => {
      expect(unitTypeToFormat(undefined)).toBeUndefined();
      expect(unitTypeToFormat(null)).toBeUndefined();
      expect(unitTypeToFormat("")).toBeUndefined();
      expect(unitTypeToFormat("generic")).toBeUndefined();
      expect(unitTypeToFormat("msg:OTHER")).toBeUndefined();
    });
  });

  describe("resolveMessageFormat", () => {
    test("prefers message, then resource, then project, then default", () => {
      expect(resolveMessageFormat("NONE", "MF1", "MF2")).toBe("NONE");
      expect(resolveMessageFormat(undefined, "MF1", "MF2")).toBe("MF1");
      expect(resolveMessageFormat(undefined, undefined, "MF1")).toBe("MF1");
      expect(resolveMessageFormat()).toBe(MSG_DEFAULT_FORMAT);
    });
  });
});
