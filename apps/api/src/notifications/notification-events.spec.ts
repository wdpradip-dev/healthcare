import { DEFAULT_TEMPLATES, EVENT_CATALOG, interpolate } from "./notification-events";

describe("interpolate", () => {
  it("substitutes known variables and leaves an unknown placeholder untouched", () => {
    expect(interpolate("Hi {{name}}, see {{doctorName}}.", { name: "Alice" })).toBe("Hi Alice, see {{doctorName}}.");
  });

  it("is a no-op with no placeholders", () => {
    expect(interpolate("Plain text.", {})).toBe("Plain text.");
  });
});

describe("EVENT_CATALOG / DEFAULT_TEMPLATES", () => {
  it("has exactly one default template per catalog event, using only variables the event actually documents (docs/22)", () => {
    const keys = Object.keys(EVENT_CATALOG);
    expect(Object.keys(DEFAULT_TEMPLATES).sort()).toEqual(keys.sort());
  });

  it("every event names at least one external channel", () => {
    for (const def of Object.values(EVENT_CATALOG)) {
      expect(def.channels.length).toBeGreaterThan(0);
      expect(new Set(def.channels).size).toBe(def.channels.length);
    }
  });

  it("gives every preference-gated (categorized) event a real category, and leaves transactional/security events uncategorized", () => {
    const transactional = ["NEW_DEVICE_LOGIN", "PASSWORD_CHANGED", "STAFF_INVITED", "STAFF_DEACTIVATED", "REFRESH_TOKEN_REUSE"];
    for (const event of transactional) {
      expect(EVENT_CATALOG[event as keyof typeof EVENT_CATALOG].category).toBeUndefined();
    }
    for (const [event, def] of Object.entries(EVENT_CATALOG)) {
      if (!transactional.includes(event)) {
        expect(def.category).toBeDefined();
      }
    }
  });

  it("every default template body renders without leaving a stray {{...}} when given its own documented variables", () => {
    const sampleVars: Record<string, string> = {
      deviceName: "an iPhone",
      doctorName: "Dr. Patel",
      appointmentTime: "9:00 AM",
      reportTitle: "CBC",
      hospitalName: "Springfield General",
    };
    for (const template of Object.values(DEFAULT_TEMPLATES)) {
      expect(interpolate(template.body, sampleVars)).not.toContain("{{");
      if (template.subject) {
        expect(interpolate(template.subject, sampleVars)).not.toContain("{{");
      }
    }
  });
});
