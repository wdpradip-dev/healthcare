import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import StaffPage from "./page";
import { branchesApi, staffApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  staffApi: { list: jest.fn(), update: jest.fn(), deactivate: jest.fn() },
  branchesApi: { list: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedList = staffApi.list as jest.Mock;
const mockedDeactivate = staffApi.deactivate as jest.Mock;
const mockedBranchList = branchesApi.list as jest.Mock;

describe("StaffPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBranchList.mockResolvedValue([]);
  });

  it("shows an empty state when no staff exist", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<StaffPage />);
    expect(await screen.findByText(/no staff yet/i)).toBeInTheDocument();
  });

  it("lists staff with job title, branch, and status", async () => {
    mockedList.mockResolvedValue([
      { id: "s1", userId: "u2", jobTitle: "Ward Nurse", status: "ACTIVE", user: { id: "u2", name: "Nina Nurse" }, branch: { id: "b1", name: "Main Branch" } },
    ]);
    renderWithQueryClient(<StaffPage />);
    expect(await screen.findByText("Nina Nurse")).toBeInTheDocument();
    expect(screen.getByText("Ward Nurse")).toBeInTheDocument();
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
  });

  it("hides Deactivate for an already-inactive staff member", async () => {
    mockedList.mockResolvedValue([
      { id: "s2", userId: "u3", jobTitle: null, status: "INACTIVE", user: { id: "u3", name: "Old Staff" }, branch: null },
    ]);
    renderWithQueryClient(<StaffPage />);
    await screen.findByText("Old Staff");
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("deactivates a staff member on click", async () => {
    mockedList.mockResolvedValue([
      { id: "s3", userId: "u4", jobTitle: null, status: "ACTIVE", user: { id: "u4", name: "Bob Staff" }, branch: null },
    ]);
    mockedDeactivate.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<StaffPage />);

    await screen.findByText("Bob Staff");
    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledWith("token", "s3"));
  });
});
