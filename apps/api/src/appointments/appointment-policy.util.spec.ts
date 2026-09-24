import { DomainException } from "@hospital/shared";
import {
  assertCheckinWindowOpen,
  assertNoShowEligible,
  assertRescheduleLimitNotExceeded,
  assertWithinBookingWindow,
  checkWindow,
  type BookingPolicy,
} from "./appointment-policy.util";

const POLICY: BookingPolicy = {
  minBookingLeadMinutes: 60,
  maxAdvanceBookingDays: 60,
  cancellationWindowMinutes: 120,
  rescheduleWindowMinutes: 120,
  maxReschedulesPerAppointment: 3,
  autoConfirmBookings: true,
  checkinWindowMinutes: 30,
};

const NOW = new Date("2026-01-04T12:00:00.000Z"); // Sunday

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

describe("assertWithinBookingWindow", () => {
  it("rejects a slot inside the minimum lead time", () => {
    expect(() => assertWithinBookingWindow(minutesFromNow(30), NOW, POLICY)).toThrow(DomainException);
  });

  it("rejects a slot beyond the maximum advance window", () => {
    const tooFar = new Date(NOW.getTime() + (POLICY.maxAdvanceBookingDays + 1) * 24 * 60 * 60_000);
    expect(() => assertWithinBookingWindow(tooFar, NOW, POLICY)).toThrow(DomainException);
  });

  it("accepts a slot within the allowed window", () => {
    expect(() => assertWithinBookingWindow(minutesFromNow(120), NOW, POLICY)).not.toThrow();
  });

  it("uses the APPOINTMENT_NOT_AVAILABLE error code", () => {
    try {
      assertWithinBookingWindow(minutesFromNow(1), NOW, POLICY);
      throw new Error("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      expect((error as DomainException).code).toBe("APPOINTMENT_NOT_AVAILABLE");
    }
  });
});

describe("checkWindow", () => {
  it("returns false and does not throw when well outside the window", () => {
    expect(checkWindow(minutesFromNow(240), NOW, 120, true, undefined)).toBe(false);
  });

  it("blocks self-service action inside the window", () => {
    expect(() => checkWindow(minutesFromNow(30), NOW, 120, true, undefined)).toThrow(DomainException);
  });

  it("blocks staff action inside the window without a reason", () => {
    expect(() => checkWindow(minutesFromNow(30), NOW, 120, false, undefined)).toThrow(DomainException);
  });

  it("requires VALIDATION_ERROR when staff omits the override reason", () => {
    try {
      checkWindow(minutesFromNow(30), NOW, 120, false, undefined);
      throw new Error("expected to throw");
    } catch (error) {
      expect((error as DomainException).code).toBe("VALIDATION_ERROR");
    }
  });

  it("allows staff override inside the window when a reason is supplied", () => {
    expect(checkWindow(minutesFromNow(30), NOW, 120, false, "Patient requested urgent change")).toBe(true);
  });
});

describe("assertRescheduleLimitNotExceeded", () => {
  it("rejects once the cap is reached", () => {
    expect(() => assertRescheduleLimitNotExceeded(3, POLICY)).toThrow(DomainException);
  });

  it("allows a reschedule below the cap", () => {
    expect(() => assertRescheduleLimitNotExceeded(2, POLICY)).not.toThrow();
  });
});

describe("assertCheckinWindowOpen", () => {
  it("rejects check-in before the window opens", () => {
    expect(() => assertCheckinWindowOpen(minutesFromNow(60), NOW, POLICY)).toThrow(DomainException);
  });

  it("allows check-in once the window is open", () => {
    expect(() => assertCheckinWindowOpen(minutesFromNow(15), NOW, POLICY)).not.toThrow();
  });

  it("allows check-in after the appointment has started", () => {
    expect(() => assertCheckinWindowOpen(minutesFromNow(-5), NOW, POLICY)).not.toThrow();
  });
});

describe("assertNoShowEligible", () => {
  it("rejects before the grace period has elapsed", () => {
    expect(() => assertNoShowEligible(minutesFromNow(-5), NOW)).toThrow(DomainException);
  });

  it("rejects for a future appointment", () => {
    expect(() => assertNoShowEligible(minutesFromNow(30), NOW)).toThrow(DomainException);
  });

  it("allows once the grace period has elapsed", () => {
    expect(() => assertNoShowEligible(minutesFromNow(-20), NOW)).not.toThrow();
  });
});
