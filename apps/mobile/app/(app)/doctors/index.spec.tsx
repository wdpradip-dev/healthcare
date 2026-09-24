import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import SearchDoctors from "./index";
import { departmentsApi, doctorsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({
  doctorsApi: { search: jest.fn() },
  departmentsApi: { search: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedDoctorsSearch = doctorsApi.search as jest.Mock;
const mockedDepartmentsSearch = departmentsApi.search as jest.Mock;

const doctorFixture = {
  id: "d1",
  hospitalId: "h1",
  qualifications: "MBBS, MD",
  bio: null,
  yearsOfExperience: 10,
  consultationFee: null,
  photoUrl: null,
  status: "ACTIVE" as const,
  user: { id: "u1", name: "Dr. Sarah Patel" },
  doctorDepartments: [{ departmentId: "dep1", isPrimary: true, department: { id: "dep1", name: "Cardiology", branchId: "b1" } }],
};

describe("SearchDoctors", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ accessToken: "token" });
    mockedDepartmentsSearch.mockResolvedValue([{ id: "dep1", hospitalId: "h1", branchId: "b1", name: "Cardiology", description: null, status: "ACTIVE", doctorDepartments: [] }]);
    mockedDoctorsSearch.mockResolvedValue([doctorFixture]);
  });

  it("lists doctors returned by the search", async () => {
    renderWithQueryClient(<SearchDoctors />);
    expect(await screen.findByText("Dr. Sarah Patel")).toBeTruthy();
    expect(screen.getByText("10 years experience")).toBeTruthy();
  });

  it("shows an empty state when no doctors match", async () => {
    mockedDoctorsSearch.mockResolvedValue([]);
    renderWithQueryClient(<SearchDoctors />);
    expect(await screen.findByText(/no doctors match your search/i)).toBeTruthy();
  });

  it("navigates to the doctor profile on tap", async () => {
    renderWithQueryClient(<SearchDoctors />);
    fireEvent.press(await screen.findByText("Dr. Sarah Patel"));
    expect(mockPush).toHaveBeenCalledWith("/doctors/d1");
  });

  it("filters by department when a chip is selected", async () => {
    renderWithQueryClient(<SearchDoctors />);
    await screen.findByText("Dr. Sarah Patel");
    fireEvent.press(screen.getByRole("button", { name: "Filter by Cardiology" }));

    await waitFor(() => {
      expect(mockedDoctorsSearch).toHaveBeenCalledWith("token", expect.objectContaining({ departmentId: "dep1" }));
    });
  });
});
