import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import Appointments from "./index";
import { appointmentsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({ appointmentsApi: { list: jest.fn() } }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedList = appointmentsApi.list as jest.Mock;

function appt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1",
    hospitalId: "h1",
    branchId: "b1",
    departmentId: "dep1",
    doctorId: "d1",
    patientId: "p1",
    startTime: "2026-08-08T09:00:00.000Z",
    endTime: "2026-08-08T09:20:00.000Z",
    status: "CONFIRMED",
    reason: null,
    queueNumber: null,
    checkedInAt: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduleCount: 0,
    doctor: { id: "d1", user: { id: "u1", name: "Dr. Sarah Patel" } },
    patient: { id: "p1", user: { id: "u2", name: "Alice Kumar" } },
    department: { id: "dep1", name: "Cardiology" },
    ...overrides,
  };
}

describe("Appointments", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("shows upcoming appointments by default", async () => {
    mockedList.mockResolvedValue([appt({ status: "CONFIRMED" }), appt({ id: "a2", status: "COMPLETED" })]);
    renderWithQueryClient(<Appointments />);
    expect(await screen.findByText("Dr. Sarah Patel")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
  });

  it("shows a CTA empty state with no upcoming appointments", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<Appointments />);
    expect(await screen.findByText(/no upcoming appointments/i)).toBeTruthy();
    fireEvent.press(screen.getByText("Book Appointment"));
    expect(mockPush).toHaveBeenCalledWith("/doctors");
  });

  it("switches to History and shows terminal-status appointments", async () => {
    mockedList.mockResolvedValue([appt({ id: "a2", status: "COMPLETED" })]);
    renderWithQueryClient(<Appointments />);

    await screen.findByText(/no upcoming appointments/i);
    fireEvent.press(screen.getByText("History"));

    expect(await screen.findByText("Completed")).toBeTruthy();
  });

  it("navigates to appointment details on card tap", async () => {
    mockedList.mockResolvedValue([appt()]);
    renderWithQueryClient(<Appointments />);

    fireEvent.press(await screen.findByText("Dr. Sarah Patel"));
    expect(mockPush).toHaveBeenCalledWith("/appointments/a1");
  });
});
