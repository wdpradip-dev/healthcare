import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import AppointmentsPage from "./page";
import { appointmentsApi, doctorsApi, patientsApi, schedulesApi } from "@/lib/resources";

let mockUser = {
  id: "u1",
  name: "Admin",
  hospitalId: "h1",
  roles: ["ADMIN"],
  permissions: ["appointments.read", "appointments.create", "appointments.update", "appointments.cancel", "appointments.checkin"],
  doctorId: null as string | null,
};

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: mockUser }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  appointmentsApi: { list: jest.fn(), getById: jest.fn(), create: jest.fn(), reschedule: jest.fn(), cancel: jest.fn(), checkin: jest.fn(), markNoShow: jest.fn() },
  doctorsApi: { list: jest.fn() },
  patientsApi: { list: jest.fn() },
  schedulesApi: { getAvailability: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedList = appointmentsApi.list as jest.Mock;
const mockedGetById = appointmentsApi.getById as jest.Mock;
const mockedCreate = appointmentsApi.create as jest.Mock;
const mockedCancel = appointmentsApi.cancel as jest.Mock;
const mockedDoctorsList = doctorsApi.list as jest.Mock;
const mockedPatientsList = patientsApi.list as jest.Mock;
const mockedGetAvailability = schedulesApi.getAvailability as jest.Mock;

const DOCTOR_ID = "22222222-2222-4222-8222-222222222222";
const DEPT_ID = "33333333-3333-4333-8333-333333333333";
const PATIENT_ID = "44444444-4444-4444-8444-444444444444";

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
  doctorDepartments: [{ departmentId: DEPT_ID, isPrimary: true, department: { id: DEPT_ID, name: "Cardiology" } }],
};

const appointmentFixture = {
  id: "a1",
  hospitalId: "h1",
  branchId: "b1",
  departmentId: DEPT_ID,
  doctorId: DOCTOR_ID,
  patientId: PATIENT_ID,
  startTime: "2026-08-08T09:00:00.000Z",
  endTime: "2026-08-08T09:20:00.000Z",
  status: "CONFIRMED" as const,
  reason: "Annual checkup",
  queueNumber: null,
  checkedInAt: null,
  cancelledAt: null,
  cancelReason: null,
  rescheduleCount: 0,
  isLateCancellation: false,
  doctor: { id: DOCTOR_ID, userId: "u2", user: { id: "u2", name: "Dr. Sarah Patel" } },
  patient: { id: PATIENT_ID, userId: "u3", user: { id: "u3", name: "Alice Kumar", email: "alice@example.test", phone: null } },
  department: { id: DEPT_ID, name: "Cardiology" },
  branch: { id: "b1", name: "Main Branch" },
};

describe("AppointmentsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: "u1",
      name: "Admin",
      hospitalId: "h1",
      roles: ["ADMIN"],
      permissions: ["appointments.read", "appointments.create", "appointments.update", "appointments.cancel", "appointments.checkin"],
      doctorId: null,
    };
    mockedDoctorsList.mockResolvedValue([doctorFixture]);
    mockedPatientsList.mockResolvedValue([{ id: PATIENT_ID, user: { id: "u3", name: "Alice Kumar" } }]);
    mockedList.mockResolvedValue([]);
  });

  it("shows an empty state when there are no appointments", async () => {
    renderWithQueryClient(<AppointmentsPage />);
    expect(await screen.findByText(/no appointments found/i)).toBeInTheDocument();
  });

  it("lists an appointment row with patient/doctor/status", async () => {
    mockedList.mockResolvedValue([appointmentFixture]);
    renderWithQueryClient(<AppointmentsPage />);

    const row = (await screen.findByText("Alice Kumar")).closest("tr")!;
    expect(within(row).getByText("Dr. Sarah Patel")).toBeInTheDocument();
    expect(within(row).getByText("Confirmed")).toBeInTheDocument();
  });

  it("hides the New Appointment button without appointments.create", async () => {
    mockUser = { ...mockUser, permissions: ["appointments.read"] };
    renderWithQueryClient(<AppointmentsPage />);
    await screen.findByText(/no appointments found/i);
    expect(screen.queryByRole("button", { name: /new appointment/i })).not.toBeInTheDocument();
  });

  it("books a new appointment through the New Appointment modal", async () => {
    mockedGetAvailability.mockResolvedValue({
      doctorId: DOCTOR_ID,
      days: [{ date: "2026-08-08", hasSlots: true, slots: [{ startTime: "2026-08-08T09:00:00.000Z", endTime: "2026-08-08T09:20:00.000Z" }] }],
    });
    mockedCreate.mockResolvedValue(appointmentFixture);
    const user = userEvent.setup();
    renderWithQueryClient(<AppointmentsPage />);

    await screen.findByText(/no appointments found/i);
    await user.click(screen.getByRole("button", { name: /new appointment/i }));

    const modal = await screen.findByRole("dialog");
    await user.selectOptions(within(modal).getByLabelText("Patient"), PATIENT_ID);
    await waitFor(() => expect(within(modal).getByLabelText("Time slot")).not.toHaveTextContent(/loading/i));
    await user.selectOptions(within(modal).getByLabelText("Time slot"), "2026-08-08T09:00:00.000Z");
    await user.click(within(modal).getByRole("button", { name: /book appointment/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ doctorId: DOCTOR_ID, departmentId: DEPT_ID, patientId: PATIENT_ID, startTime: "2026-08-08T09:00:00.000Z" }),
      );
    });
  });

  it("opens Appointment Details on row click and cancels it", async () => {
    mockedList.mockResolvedValue([appointmentFixture]);
    mockedGetById.mockResolvedValue({ ...appointmentFixture, history: [] });
    mockedCancel.mockResolvedValue({ ...appointmentFixture, status: "CANCELLED" });
    const user = userEvent.setup();
    renderWithQueryClient(<AppointmentsPage />);

    await user.click(await screen.findByText("Alice Kumar"));
    const modal = await screen.findByRole("dialog");
    await within(modal).findByText("Annual checkup");

    await user.click(within(modal).getByRole("button", { name: /^cancel$/i }));
    await user.click(within(modal).getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith("token", "a1", { reason: undefined }));
  });
});
