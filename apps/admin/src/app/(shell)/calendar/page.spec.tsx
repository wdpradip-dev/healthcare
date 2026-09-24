import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import CalendarPage from "./page";
import { appointmentsApi, doctorsApi } from "@/lib/resources";

const mockUser = {
  id: "u1",
  name: "Admin",
  hospitalId: "h1",
  roles: ["ADMIN"],
  permissions: ["appointments.read"],
  doctorId: null as string | null,
};

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: mockUser }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  appointmentsApi: { list: jest.fn(), getById: jest.fn(), cancel: jest.fn(), checkin: jest.fn(), markNoShow: jest.fn(), reschedule: jest.fn() },
  doctorsApi: { list: jest.fn() },
  schedulesApi: { getAvailability: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedList = appointmentsApi.list as jest.Mock;
const mockedGetById = appointmentsApi.getById as jest.Mock;
const mockedDoctorsList = doctorsApi.list as jest.Mock;

const DOCTOR_ID = "22222222-2222-4222-8222-222222222222";

const doctorFixture = {
  id: DOCTOR_ID,
  hospitalId: "h1",
  userId: "u2",
  qualifications: "MBBS",
  bio: null,
  yearsOfExperience: null,
  consultationFee: null,
  defaultConsultationDurationMinutes: 20,
  photoUrl: null,
  status: "ACTIVE" as const,
  user: { id: "u2", name: "Dr. Sarah Patel", email: null, phone: null },
  doctorDepartments: [],
};

const appointmentFixture = {
  id: "a1",
  hospitalId: "h1",
  branchId: "b1",
  departmentId: "d1",
  doctorId: DOCTOR_ID,
  patientId: "p1",
  startTime: "2026-08-08T09:00:00.000Z",
  endTime: "2026-08-08T09:20:00.000Z",
  status: "CONFIRMED" as const,
  reason: null,
  queueNumber: null,
  checkedInAt: null,
  cancelledAt: null,
  cancelReason: null,
  rescheduleCount: 0,
  isLateCancellation: false,
  doctor: { id: DOCTOR_ID, userId: "u2", user: { id: "u2", name: "Dr. Sarah Patel" } },
  patient: { id: "p1", userId: "u3", user: { id: "u3", name: "Alice Kumar", email: null, phone: null } },
};

describe("CalendarPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDoctorsList.mockResolvedValue([doctorFixture]);
  });

  it("shows an empty state when there are no appointments that day", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<CalendarPage />);
    expect(await screen.findByText(/no appointments on this day/i)).toBeInTheDocument();
  });

  it("renders a doctor column with a booked cell", async () => {
    mockedList.mockResolvedValue([appointmentFixture]);
    renderWithQueryClient(<CalendarPage />);

    expect(await screen.findByText("Dr. Sarah Patel")).toBeInTheDocument();
    expect(screen.getByText("Alice Kumar")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("opens Appointment Details when a booked cell is clicked", async () => {
    mockedList.mockResolvedValue([appointmentFixture]);
    mockedGetById.mockResolvedValue({ ...appointmentFixture, history: [], department: { id: "d1", name: "Cardiology" } });
    const user = userEvent.setup();
    renderWithQueryClient(<CalendarPage />);

    await user.click(await screen.findByText("Alice Kumar"));
    const modal = await screen.findByRole("dialog");
    expect(modal).toBeInTheDocument();
    await waitFor(() => expect(mockedGetById).toHaveBeenCalledWith("token", "a1"));
  });

  it("re-fetches when navigating to the next day", async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithQueryClient(<CalendarPage />);

    await screen.findByText(/no appointments on this day/i);
    const callsBefore = mockedList.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "▶" }));

    await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
