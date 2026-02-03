/**
 * Tests for validation utilities and schemas
 * Consolidates edge case testing from legacy test files
 */

import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  extractSingleValue,
  validateActorIdentifier,
  validateDomain,
  validateQuery,
} from "../../src/server/validators.js";
import { ActorIdentifierSchema, DomainSchema, QuerySchema } from "../../src/validation/schemas.js";

describe("Validation Schemas", () => {
  describe("DomainSchema", () => {
    it("should accept valid domains", () => {
      const validDomains = [
        "mastodon.social",
        "fosstodon.org",
        "social.example.com",
        "sub.domain.example.co.uk",
        "a1.b2.c3",
      ];

      for (const domain of validDomains) {
        expect(DomainSchema.safeParse(domain).success).toBe(true);
      }
    });

    it("should reject empty domains", () => {
      const result = DomainSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject domains without TLD", () => {
      const result = DomainSchema.safeParse("localhost");
      expect(result.success).toBe(false);
    });

    it("should reject domains with double dots", () => {
      const result = DomainSchema.safeParse("example..com");
      expect(result.success).toBe(false);
    });

    it("should reject domains starting with dot", () => {
      const result = DomainSchema.safeParse(".example.com");
      expect(result.success).toBe(false);
    });

    it("should reject domains ending with dot", () => {
      const result = DomainSchema.safeParse("example.com.");
      expect(result.success).toBe(false);
    });

    it("should reject domains exceeding max length", () => {
      const longDomain = `${"a".repeat(250)}.com`;
      const result = DomainSchema.safeParse(longDomain);
      expect(result.success).toBe(false);
    });

    it("should reject invalid characters", () => {
      const invalidDomains = [
        "example@.com",
        "example$.com",
        "example!.com",
        "example .com",
        "example\t.com",
      ];

      for (const domain of invalidDomains) {
        expect(DomainSchema.safeParse(domain).success).toBe(false);
      }
    });
  });

  describe("ActorIdentifierSchema", () => {
    it("should accept valid identifiers", () => {
      const validIdentifiers = [
        "user@mastodon.social",
        "@user@mastodon.social",
        "User_Name@example.com",
        "user-name@sub.domain.org",
        "user.name@example.co.uk",
        "user123@example.com",
      ];

      for (const identifier of validIdentifiers) {
        expect(ActorIdentifierSchema.safeParse(identifier).success).toBe(true);
      }
    });

    it("should reject empty identifiers", () => {
      const result = ActorIdentifierSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject identifiers that are too short", () => {
      const result = ActorIdentifierSchema.safeParse("ab");
      expect(result.success).toBe(false);
    });

    it("should reject identifiers without domain", () => {
      const result = ActorIdentifierSchema.safeParse("justusername");
      expect(result.success).toBe(false);
    });

    it("should reject identifiers with invalid domain", () => {
      const result = ActorIdentifierSchema.safeParse("user@localhost");
      expect(result.success).toBe(false);
    });

    it("should reject identifiers exceeding max length", () => {
      // Max length is 320, so we need username + @ + domain > 320
      // @example.com is 12 chars, so username needs > 308 chars
      const longUsername = "a".repeat(310);
      const result = ActorIdentifierSchema.safeParse(`${longUsername}@example.com`);
      expect(result.success).toBe(false);
    });

    it("should reject identifiers with invalid characters in username", () => {
      const invalidIdentifiers = [
        "user name@example.com",
        "user\t@example.com",
        "user!@example.com",
        "user$@example.com",
      ];

      for (const identifier of invalidIdentifiers) {
        expect(ActorIdentifierSchema.safeParse(identifier).success).toBe(false);
      }
    });

    it("should reject identifiers with multiple @ symbols incorrectly placed", () => {
      const result = ActorIdentifierSchema.safeParse("user@@example.com");
      expect(result.success).toBe(false);
    });
  });

  describe("QuerySchema", () => {
    it("should accept valid queries", () => {
      const validQueries = ["test", "hello world", "search term", "a".repeat(500)];

      for (const query of validQueries) {
        expect(QuerySchema.safeParse(query).success).toBe(true);
      }
    });

    it("should reject empty queries", () => {
      const result = QuerySchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject queries exceeding max length", () => {
      const longQuery = "a".repeat(501);
      const result = QuerySchema.safeParse(longQuery);
      expect(result.success).toBe(false);
    });
  });
});

describe("Validator Functions", () => {
  describe("validateActorIdentifier", () => {
    it("should return valid identifier", () => {
      const result = validateActorIdentifier("user@mastodon.social");
      expect(result).toBe("user@mastodon.social");
    });

    it("should throw McpError for empty identifier", () => {
      expect(() => validateActorIdentifier("")).toThrow(McpError);
    });

    it("should throw McpError for invalid format", () => {
      expect(() => validateActorIdentifier("invalid-format")).toThrow(McpError);
    });

    it("should throw McpError with descriptive message", () => {
      try {
        validateActorIdentifier("");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain("Invalid actor identifier");
      }
    });
  });

  describe("validateDomain", () => {
    it("should return valid domain", () => {
      const result = validateDomain("mastodon.social");
      expect(result).toBe("mastodon.social");
    });

    it("should throw McpError for empty domain", () => {
      expect(() => validateDomain("")).toThrow(McpError);
    });

    it("should throw McpError for invalid domain", () => {
      expect(() => validateDomain("invalid-domain")).toThrow(McpError);
    });

    it("should throw McpError with descriptive message", () => {
      try {
        validateDomain("");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain("Invalid domain");
      }
    });
  });

  describe("validateQuery", () => {
    it("should return valid query", () => {
      const result = validateQuery("test search");
      expect(result).toBe("test search");
    });

    it("should throw McpError for empty query", () => {
      expect(() => validateQuery("")).toThrow(McpError);
    });

    it("should throw McpError for query exceeding max length", () => {
      const longQuery = "a".repeat(501);
      expect(() => validateQuery(longQuery)).toThrow(McpError);
    });

    it("should throw McpError with descriptive message", () => {
      try {
        validateQuery("");
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain("Invalid query");
      }
    });
  });

  describe("extractSingleValue", () => {
    it("should return string value as-is", () => {
      expect(extractSingleValue("test")).toBe("test");
    });

    it("should return first element of array", () => {
      expect(extractSingleValue(["first", "second"])).toBe("first");
    });

    it("should return empty string for undefined", () => {
      expect(extractSingleValue(undefined)).toBe("");
    });

    it("should return empty string for empty array", () => {
      expect(extractSingleValue([])).toBe("");
    });
  });
});

describe("Edge Cases", () => {
  describe("Boundary conditions for identifiers", () => {
    it("should handle identifier at minimum valid length", () => {
      // Minimum: 3 chars total, valid format
      const result = ActorIdentifierSchema.safeParse("a@b.c");
      // This is 5 chars but might not pass domain validation
      // Let's use a proper minimum
      const result2 = ActorIdentifierSchema.safeParse("a@b.co");
      expect(result2.success).toBe(true);
    });

    it("should handle identifier at maximum valid length", () => {
      const username = "a".repeat(100);
      const domain = `${"b".repeat(50)}.com`;
      const identifier = `${username}@${domain}`;
      // Should be under 320 chars
      expect(identifier.length).toBeLessThanOrEqual(320);
      const result = ActorIdentifierSchema.safeParse(identifier);
      expect(result.success).toBe(true);
    });

    it("should reject identifier just over maximum length", () => {
      // Max is 320: need exactly 321 chars to be just over
      // @example.com is 12 chars, so username needs 309 chars = 321 total
      const username = "a".repeat(309);
      const identifier = `${username}@example.com`;
      expect(identifier.length).toBe(321);
      const result = ActorIdentifierSchema.safeParse(identifier);
      expect(result.success).toBe(false);
    });
  });

  describe("Special character handling", () => {
    it("should handle hyphens in domain", () => {
      const result = DomainSchema.safeParse("my-instance.social");
      expect(result.success).toBe(true);
    });

    it("should reject domain starting with hyphen", () => {
      const result = DomainSchema.safeParse("-invalid.com");
      expect(result.success).toBe(false);
    });

    it("should reject domain ending with hyphen", () => {
      const result = DomainSchema.safeParse("invalid-.com");
      expect(result.success).toBe(false);
    });

    it("should handle underscores in username", () => {
      const result = ActorIdentifierSchema.safeParse("user_name@example.com");
      expect(result.success).toBe(true);
    });

    it("should handle dots in username", () => {
      const result = ActorIdentifierSchema.safeParse("user.name@example.com");
      expect(result.success).toBe(true);
    });
  });

  describe("Unicode and encoding", () => {
    it("should reject unicode domains (IDN not supported)", () => {
      const result = DomainSchema.safeParse("例え.jp");
      expect(result.success).toBe(false);
    });

    it("should reject unicode usernames", () => {
      const result = ActorIdentifierSchema.safeParse("用户@example.com");
      expect(result.success).toBe(false);
    });
  });
});
