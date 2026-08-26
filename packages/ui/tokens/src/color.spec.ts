import { lightColors, darkColors, appointmentStatusColor } from "./color";

describe("color tokens", () => {
  it("defines the same set of token keys for both themes", () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it("every value is a valid 6-digit hex color", () => {
    for (const value of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("maps every Appointment.status value to a defined color token", () => {
    for (const tokenKey of Object.values(appointmentStatusColor)) {
      expect(lightColors).toHaveProperty(tokenKey);
    }
  });
});
