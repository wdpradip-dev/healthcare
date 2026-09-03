import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import DepartmentsPage from "./page";
import { branchesApi, departmentsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  branchesApi: { list: jest.fn() },
  departmentsApi: { list: jest.fn(), create: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedBranchesList = branchesApi.list as jest.Mock;
const mockedDepartmentsList = departmentsApi.list as jest.Mock;
const mockedCreate = departmentsApi.create as jest.Mock;

describe("DepartmentsPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prompts to add a branch first when none exist", async () => {
    mockedBranchesList.mockResolvedValue([]);
    mockedDepartmentsList.mockResolvedValue([]);
    renderWithQueryClient(<DepartmentsPage />);
    expect(await screen.findByText(/add a branch first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add department/i })).toBeDisabled();
  });

  it("lists departments with their branch name and doctor count", async () => {
    mockedBranchesList.mockResolvedValue([{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Main Branch" }]);
    mockedDepartmentsList.mockResolvedValue([
      { id: "d1", hospitalId: "h1", branchId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Cardiology", status: "ACTIVE", doctorDepartments: [{}, {}] },
    ]);
    renderWithQueryClient(<DepartmentsPage />);
    expect(await screen.findByText("Cardiology")).toBeInTheDocument();
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("creates a department scoped to the selected branch", async () => {
    mockedBranchesList.mockResolvedValue([{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Main Branch" }]);
    mockedDepartmentsList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "d2" });
    const user = userEvent.setup();
    renderWithQueryClient(<DepartmentsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /add department/i })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: /add department/i }));
    await user.type(screen.getByLabelText("Name"), "Cardiology");
    await user.click(screen.getByRole("button", { name: /create department/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ hospitalId: "h1", branchId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Cardiology" }),
      );
    });
  });
});
