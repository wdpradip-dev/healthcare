import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import DoctorProfile from "./[id]";
import { doctorsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ id: "d1" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({ doctorsApi: { getById: jest.fn() } }));

const mockedUseAuth = useAuth as jest.Mock;
const mockedGetById = doctorsApi.getById as jest.Mock;

const doctorFixture = {
  id: "d1",
  hospitalId: "h1",
  qualifications: "MBBS, MD",
  bio: "15 years in interventional cardiology.",
  yearsOfExperience: 15,
  consultationFee: "50",
  photoUrl: null,
  status: "ACTIVE" as const,
  user: { id: "u1", name: "Dr. Sarah Patel" },
  doctorDepartments: [{ departmentId: "dep1", isPrimary: true, department: { id: "dep1", name: "Cardiology", branchId: "b1" } }],
};

describe("DoctorProfile", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ accessToken: "token" });
    mockedGetById.mockResolvedValue(doctorFixture);
  });

  it("renders the doctor's profile details", async () => {
    renderWithQueryClient(<DoctorProfile />);
    expect(await screen.findByText("Dr. Sarah Patel")).toBeTruthy();
    expect(screen.getByText("MBBS, MD")).toBeTruthy();
    expect(screen.getByText(/15 years in interventional cardiology/)).toBeTruthy();
    expect(screen.getByText("Consultation fee: $50")).toBeTruthy();
  });

  it("navigates to booking with the primary department pre-selected", async () => {
    renderWithQueryClient(<DoctorProfile />);
    fireEvent.press(await screen.findByText("Book Appointment"));
    expect(mockPush).toHaveBeenCalledWith("/booking/d1?departmentId=dep1");
  });

  it("shows an unavailable message for a doctor with no department assignment", async () => {
    mockedGetById.mockResolvedValue({ ...doctorFixture, doctorDepartments: [] });
    renderWithQueryClient(<DoctorProfile />);
    expect(await screen.findByText(/not currently accepting bookings/i)).toBeTruthy();
  });

  it("shows a not-found state when the doctor lookup fails", async () => {
    mockedGetById.mockRejectedValue(new Error("not found"));
    renderWithQueryClient(<DoctorProfile />);
    expect(await screen.findByText(/no longer available/i)).toBeTruthy();
  });
});
