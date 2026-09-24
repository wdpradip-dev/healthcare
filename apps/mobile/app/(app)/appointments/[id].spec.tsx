import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import AppointmentDetails from "./[id]";
import { appointmentsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ id: "a1" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({
  appointmentsApi: { getById: jest.fn(), cancel: jest.fn(), checkin: jest.fn() },
}));
// See booking/confirm.spec.tsx for why this is a manual mock, not `jest.mock("@/lib/api-client")` alone.
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
const mockedGetById = appointmentsApi.getById as jest.Mock;
const mockedCancel = appointmentsApi.cancel as jest.Mock;
const mockedCheckin = appointmentsApi.checkin as jest.Mock;

function detail(overrides: Partial<Record<string, unknown>> = {}) {
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
    reason: "Annual checkup",
    queueNumber: null,
    checkedInAt: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduleCount: 0,
    doctor: { id: "d1", user: { id: "u1", name: "Dr. Sarah Patel" } },
    patient: { id: "p1", user: { id: "u2", name: "Alice Kumar" } },
    department: { id: "dep1", name: "Cardiology" },
    branch: { id: "b1", name: "Main Branch" },
    history: [],
    ...overrides,
  };
}

describe("AppointmentDetails", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("renders the appointment summary and status", async () => {
    mockedGetById.mockResolvedValue(detail());
    renderWithQueryClient(<AppointmentDetails />);

    expect(await screen.findByText("Dr. Sarah Patel")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("Reason: Annual checkup")).toBeTruthy();
  });

  it("checks in and shows the queue-number confirmation", async () => {
    // The modal reads `appointment.queueNumber` from the re-fetched detail
    // query (checkin's onSuccess invalidates it), not from the mutation's
    // own response — so the mock tracks whether checkin has happened yet,
    // rather than relying on a fragile call-count sequence (React Query may
    // issue more than one `getById` call before/around the invalidation).
    let checkedIn = false;
    mockedGetById.mockImplementation(() => Promise.resolve(checkedIn ? detail({ status: "CHECKED_IN", queueNumber: 12 }) : detail()));
    mockedCheckin.mockImplementation(() => {
      checkedIn = true;
      return Promise.resolve({ ...detail(), status: "CHECKED_IN", queueNumber: 12 });
    });
    renderWithQueryClient(<AppointmentDetails />);

    fireEvent.press(await screen.findByText("Check In"));

    await waitFor(() => expect(mockedCheckin).toHaveBeenCalledWith("token", "a1"));
    await screen.findByText("You're checked in");
    // Queue number 12 now shows both in the page body and the check-in
    // modal, and `{"Queue number: "}{queueNumber}` renders as sibling text
    // nodes within one <Text> — `getAllByText`/`exact: false` tolerates both.
    expect(screen.getAllByText("12", { exact: false }).length).toBeGreaterThan(0);
  });

  it("cancels the appointment with an optional reason", async () => {
    mockedGetById.mockResolvedValue(detail());
    mockedCancel.mockResolvedValue({ ...detail(), status: "CANCELLED" });
    renderWithQueryClient(<AppointmentDetails />);

    fireEvent.press(await screen.findByText("Cancel"));
    fireEvent.changeText(await screen.findByLabelText("Reason (optional)"), "Can't make it");
    fireEvent.press(screen.getByText("Yes, Cancel"));

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith("token", "a1", { reason: "Can't make it" }));
  });

  it("hides Check In and Reschedule once already checked in", async () => {
    mockedGetById.mockResolvedValue(detail({ status: "CHECKED_IN", checkedInAt: "2026-08-08T08:50:00.000Z", queueNumber: 3 }));
    renderWithQueryClient(<AppointmentDetails />);

    await screen.findByText("Dr. Sarah Patel");
    expect(screen.queryByText("Check In")).toBeNull();
    expect(screen.queryByText("Reschedule")).toBeNull();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("shows a not-found state on load failure", async () => {
    mockedGetById.mockRejectedValue(new Error("not found"));
    renderWithQueryClient(<AppointmentDetails />);
    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
  });
});
