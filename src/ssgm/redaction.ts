/**
 * SSGM Data Redaction
 * 
 * Redacts sensitive data from events for safe display.
 */

import type { SsgmEvent, SsgmRedactionConfig, SsgmWorkspaceSnapshot, SsgmTaskGraph } from "./types.js";

const DEFAULT_REDACT_PATTERNS = [
  /api[_-]?key['"]?\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi,
  /password['"]?\s*[:=]\s*['"]?[^\s&'"]+/gi,
  /token['"]?\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi,
  /secret['"]?\s*[:=]\s*['"]?[^\s&'"]+/gi,
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
];

const REDACTED_TEXT = "[REDACTED]";

export function createRedactor(config: SsgmRedactionConfig = {}) {
  const patterns = config.redactPatterns ?? DEFAULT_REDACT_PATTERNS;
  
  function redactString(str: string): string {
    let result = str;
    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        // Keep first 4 chars visible if long enough
        if (match.length > 12) {
          return match.slice(0, 4) + "..." + REDACTED_TEXT;
        }
        return REDACTED_TEXT;
      });
    }
    return result;
  }
  
  function redactValue(value: unknown): unknown {
    if (typeof value === "string") {
      return redactString(value);
    }
    if (Array.isArray(value)) {
      return value.map(redactValue);
    }
    if (value && typeof value === "object") {
      const redacted: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        // Redact sensitive keys entirely
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("token") ||
          lowerKey.includes("api_key") ||
          lowerKey.includes("apikey") ||
          lowerKey.includes("private_key") ||
          lowerKey.includes("credential")
        ) {
          redacted[key] = REDACTED_TEXT;
        } else {
          redacted[key] = redactValue(val);
        }
      }
      return redacted;
    }
    return value;
  }
  
  return {
    redactEvent(event: SsgmEvent): SsgmEvent {
      const redacted: SsgmEvent = { ...event };
      
      // Redact payload
      redacted.payload = redactValue(event.payload) as Record<string, unknown>;
      
      return redacted;
    },
    
    redactEvents(events: SsgmEvent[]): SsgmEvent[] {
      return events.map(e => this.redactEvent(e));
    },
    
    redactWorkspaceSnapshot(
      snapshot: SsgmWorkspaceSnapshot,
      redactContents = config.redactFileContents ?? false,
    ): SsgmWorkspaceSnapshot {
      if (!redactContents) {
        return snapshot;
      }
      
      return {
        ...snapshot,
        files: snapshot.files.map(file => ({
          ...file,
          content: file.content ? redactString(file.content) : undefined,
        })),
      };
    },
    
    redactString,
    redactValue,
  };
}

export type Redactor = ReturnType<typeof createRedactor>;

// Default redactor instance
export const defaultRedactor = createRedactor();
