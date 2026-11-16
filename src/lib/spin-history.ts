/**
 * Helper to parse SpinHistory resultLabel.
 * Supports legacy plain string label as well as encoded JSON containing
 * both participant name and prize label.
 */
export function parseSpinResult(
  rawLabel: string,
  defaultParticipant: string
): { participant: string; prize: string } {
  if (rawLabel && typeof rawLabel === "string" && rawLabel.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawLabel);
      if (parsed && typeof parsed === "object" && parsed.prize) {
        return {
          participant: String(parsed.participant || defaultParticipant),
          prize: String(parsed.prize),
        };
      }
    } catch {
      // Fallback to raw string if JSON parsing fails
    }
  }

  return {
    participant: defaultParticipant,
    prize: rawLabel,
  };
}
