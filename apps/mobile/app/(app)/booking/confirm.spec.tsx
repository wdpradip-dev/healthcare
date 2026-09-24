import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import BookingConfirmation from "./confirm";
import { appointmentsApi, doctorsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ doctorId: "d1", departmentId: "dep1", startTime: "2026-08-08T09:00:00.000Z", endTime: "2026-08-08T09:20:00.000Z" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({
  doctorsApi: { getById: jest.fn() },
  appointmentsApi: { create: jest.fn() },
}));
// Manually mocked (not `jest.mock("@/lib/api-client")` alone) so `ApiError`
// keeps a real constructor — the component's `instanceof ApiError` +
// `.code` branching needs actual property assignment, which an auto-mocked
// class wouldn't provide. This also avoids the real module's top-level
// `EXPO_PUBLIC_API_BASE_URL` guard throwing in the test environment.
jest.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    details?: { field: string; message: string }[];
    constructor(code: string, message: string, details?: { field: string; message: string }[]) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedGetById = doctorsApi.getById as jest.Mock;
const mockedCreate = appointmentsApi.create as jest.Mock;

const doctorFixture = {
  id: "d1",
  hospitalId: "h1",
  qualifications: "MBBS",
  bio: null,
  yearsOfExperience: null,
  consultationFee: "50",
  photoUrl: null,
  status: "ACTIVE" as const,
  user: { id: "u1", name: "Dr. Sarah Patel" },
  doctorDepartments: [{ departmentId: "dep1", isPrimary: true, department: { id: "dep1", name: "Cardiology", branchId: "b1" } }],
};

const appointmentFixture = {
  id: "a1",
  status: "CONFIRMED",
  doctorId: "d1",
  patientId: "p1",
  startTime: "2026-08-08T09:00:00.000Z",
  endTime: "2026-08-08T09:20:00.000Z",
  reason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("BookingConfirmation", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ accessToken: "token" });
    mockedGetById.mockResolvedValue(doctorFixture);
  });

  it("shows the review summary before submitting", async () => {
    renderWithQueryClient(<BookingConfirmation />);
    expect(await screen.findByText("Dr. Sarah Patel")).toBeTruthy();
    expect(screen.getByText("Consultation fee: $50")).toBeTruthy();
  });

  it("books the appointment and shows the success state", async () => {
    mockedCreate.mockResolvedValue(appointmentFixture);
    renderWithQueryClient(<BookingConfirmation />);

    fireEvent.press(await screen.findByText("Confirm Booking"));

    expect(await screen.findByText("Appointment Confirmed")).toBeTruthy();
    expect(mockedCreate).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ doctorId: "d1", departmentId: "dep1", startTime: "2026-08-08T09:00:00.000Z" }),
    );
  });

  it("shows a friendly message when the slot was taken by someone else", async () => {
    mockedCreate.mockRejectedValue(new ApiError("APPOINTMENT_CONFLICT", "This slot is no longer available."));
    renderWithQueryClient(<BookingConfirmation />);

    fireEvent.press(await screen.findByText("Confirm Booking"));

    expect(await screen.findByText(/no longer available/i)).toBeTruthy();
  });

  it("navigates to the appointment on 'View Appointment'", async () => {
    mockedCreate.mockResolvedValue(appointmentFixture);
    renderWithQueryClient(<BookingConfirmation />);

    fireEvent.press(await screen.findByText("Confirm Booking"));
    fireEvent.press(await screen.findByText("View Appointment"));

    expect(mockReplace).toHaveBeenCalledWith("/appointments/a1");
  });
});
