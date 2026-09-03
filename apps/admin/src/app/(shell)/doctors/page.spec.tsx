import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import DoctorsPage from "./page";
import { departmentsApi, doctorsApi, usersApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  doctorsApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), assignDepartment: jest.fn(), removeDepartment: jest.fn() },
  departmentsApi: { list: jest.fn() },
  usersApi: { list: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedList = doctorsApi.list as jest.Mock;
const mockedCreate = doctorsApi.create as jest.Mock;
const mockedDeptList = departmentsApi.list as jest.Mock;
const mockedUsersList = usersApi.list as jest.Mock;

describe("DoctorsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDeptList.mockResolvedValue([]);
    mockedUsersList.mockResolvedValue([]);
  });

  it("shows an empty state when no doctors exist", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<DoctorsPage />);
    expect(await screen.findByText(/no doctors yet/i)).toBeInTheDocument();
  });

  it("lists doctors with their qualifications and department badges", async () => {
    mockedList.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        qualifications: "MBBS, MD",
        status: "ACTIVE",
        user: { id: "22222222-2222-4222-8222-222222222222", name: "Dr. Dana Doctor", email: "dana@example.test" },
        doctorDepartments: [
          {
            departmentId: "33333333-3333-4333-8333-333333333333",
            isPrimary: true,
            department: { id: "33333333-3333-4333-8333-333333333333", name: "Cardiology" },
          },
        ],
      },
    ]);
    renderWithQueryClient(<DoctorsPage />);
    expect(await screen.findByText("Dr. Dana Doctor")).toBeInTheDocument();
    expect(screen.getByText("MBBS, MD")).toBeInTheDocument();
    expect(screen.getByText("Cardiology")).toBeInTheDocument();
  });

  it("creates a Doctor profile from an invited Doctor-role user", async () => {
    mockedList.mockResolvedValue([]);
    mockedUsersList.mockResolvedValue([
      { id: "99999999-9999-4999-8999-999999999999", name: "Dr. New Doc", email: "newdoc@example.test" },
    ]);
    mockedCreate.mockResolvedValue({ id: "d9" });
    const user = userEvent.setup();
    renderWithQueryClient(<DoctorsPage />);

    await screen.findByText(/no doctors yet/i);
    await user.click(screen.getByRole("button", { name: /add doctor/i }));
    await user.type(await screen.findByLabelText("Qualifications"), "MBBS");
    await user.click(screen.getByRole("button", { name: /create doctor profile/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({
          hospitalId: "h1",
          userId: "99999999-9999-4999-8999-999999999999",
          qualifications: "MBBS",
        }),
      );
    });
  });
});
