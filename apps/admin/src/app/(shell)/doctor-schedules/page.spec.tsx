import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import DoctorSchedulesPage from "./page";
import { doctorsApi, schedulesApi } from "@/lib/resources";

let mockUser = {
  id: "u1",
  name: "Admin",
  hospitalId: "h1",
  roles: ["ADMIN"],
  permissions: ["schedules.read", "schedules.write"],
  doctorId: null as string | null,
};

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: mockUser }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  doctorsApi: { list: jest.fn() },
  schedulesApi: { getTemplate: jest.fn(), replaceTemplate: jest.fn(), listExceptions: jest.fn(), createException: jest.fn(), deleteException: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedDoctorsList = doctorsApi.list as jest.Mock;
const mockedGetTemplate = schedulesApi.getTemplate as jest.Mock;
const mockedReplaceTemplate = schedulesApi.replaceTemplate as jest.Mock;
const mockedListExceptions = schedulesApi.listExceptions as jest.Mock;
const mockedCreateException = schedulesApi.createException as jest.Mock;
const mockedDeleteException = schedulesApi.deleteException as jest.Mock;

const doctorFixture = {
  id: "22222222-2222-4222-8222-222222222222",
  hospitalId: "h1",
  userId: "u2",
  qualifications: "MBBS",
  bio: null,
  yearsOfExperience: null,
  consultationFee: null,
  defaultConsultationDurationMinutes: 20,
  photoUrl: null,
  status: "ACTIVE" as const,
  user: { id: "u2", name: "Dr. Dana Doctor", email: "dana@example.test", phone: null },
  doctorDepartments: [
    { departmentId: "33333333-3333-4333-8333-333333333333", isPrimary: true, department: { id: "33333333-3333-4333-8333-333333333333", name: "Cardiology" } },
  ],
};

describe("DoctorSchedulesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: ["schedules.read", "schedules.write"], doctorId: null };
    mockedDoctorsList.mockResolvedValue([doctorFixture]);
    mockedGetTemplate.mockResolvedValue([]);
    mockedListExceptions.mockResolvedValue([]);
  });

  it("auto-selects the first doctor and shows empty states", async () => {
    renderWithQueryClient(<DoctorSchedulesPage />);
    expect(await screen.findByText(/no schedule set yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no exceptions scheduled/i)).toBeInTheDocument();
    expect(mockedGetTemplate).toHaveBeenCalledWith("token", doctorFixture.id);
  });

  it("lists an existing template row and exception", async () => {
    mockedGetTemplate.mockResolvedValue([
      {
        id: "s1",
        doctorId: doctorFixture.id,
        departmentId: doctorFixture.doctorDepartments[0]!.departmentId,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        slotDurationMinutes: 20,
        bufferMinutes: 5,
        maxAppointments: 24,
        department: { id: doctorFixture.doctorDepartments[0]!.departmentId, name: "Cardiology" },
      },
    ]);
    mockedListExceptions.mockResolvedValue([
      { id: "e1", doctorId: doctorFixture.id, type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25", startTime: null, endTime: null, reason: "Christmas" },
    ]);

    renderWithQueryClient(<DoctorSchedulesPage />);
    expect(await screen.findByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("09:00–17:00")).toBeInTheDocument();
    expect(screen.getByText("2026-12-25")).toBeInTheDocument();
    expect(screen.getByText("HOLIDAY")).toBeInTheDocument();
  });

  it("adds a schedule block and saves the template", async () => {
    mockedReplaceTemplate.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithQueryClient(<DoctorSchedulesPage />);

    await screen.findByText(/no schedule set yet/i);
    await user.click(screen.getByRole("button", { name: /edit template/i }));
    await user.click(await screen.findByRole("button", { name: /\+ add block/i }));
    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(mockedReplaceTemplate).toHaveBeenCalledWith(
        "token",
        doctorFixture.id,
        expect.objectContaining({
          days: [expect.objectContaining({ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 20 })],
        }),
      );
    });
  });

  it("creates a Holiday exception", async () => {
    mockedCreateException.mockResolvedValue({ id: "e2" });
    const user = userEvent.setup();
    renderWithQueryClient(<DoctorSchedulesPage />);

    await screen.findByText(/no exceptions scheduled/i);
    await user.click(screen.getByRole("button", { name: /add exception/i }));
    await user.selectOptions(await screen.findByLabelText("Type"), "HOLIDAY");
    await user.type(screen.getByLabelText("Start date"), "2026-12-25");
    await user.type(screen.getByLabelText("End date"), "2026-12-25");
    await user.click(screen.getByRole("button", { name: /save exception/i }));

    await waitFor(() => {
      expect(mockedCreateException).toHaveBeenCalledWith(
        "token",
        doctorFixture.id,
        expect.objectContaining({ type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25" }),
      );
    });
  });

  it("removes an exception", async () => {
    mockedListExceptions.mockResolvedValue([
      { id: "e1", doctorId: doctorFixture.id, type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25", startTime: null, endTime: null, reason: null },
    ]);
    mockedDeleteException.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderWithQueryClient(<DoctorSchedulesPage />);

    await screen.findByText("HOLIDAY");
    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(mockedDeleteException).toHaveBeenCalledWith("token", doctorFixture.id, "e1"));
  });

  it("for a Doctor-self session, skips the doctor selector and doctorsApi.list() entirely", async () => {
    mockUser = {
      id: "u2",
      name: "Dr. Dana Doctor",
      hospitalId: "h1",
      roles: ["DOCTOR"],
      permissions: ["schedules.read", "schedules.write"],
      doctorId: doctorFixture.id,
    };
    renderWithQueryClient(<DoctorSchedulesPage />);

    await screen.findByText(/no schedule set yet/i);
    expect(mockedDoctorsList).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Doctor")).not.toBeInTheDocument();
  });

  it("hides write actions for a read-only (Receptionist/Nurse) actor", async () => {
    mockUser = { id: "u3", name: "Nina Nurse", hospitalId: "h1", roles: ["NURSE"], permissions: ["schedules.read"], doctorId: null };
    renderWithQueryClient(<DoctorSchedulesPage />);

    await screen.findByText(/no schedule set yet/i);
    expect(screen.queryByRole("button", { name: /edit template/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add exception/i })).not.toBeInTheDocument();
  });
});
