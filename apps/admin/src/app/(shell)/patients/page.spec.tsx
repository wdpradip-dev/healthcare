import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import PatientsPage from "./page";
import { patientsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({ patientsApi: { list: jest.fn(), register: jest.fn(), update: jest.fn() } }));
jest.mock("@/lib/api-client");

const mockedList = patientsApi.list as jest.Mock;
const mockedRegister = patientsApi.register as jest.Mock;

describe("PatientsPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state when no patients are registered", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<PatientsPage />);
    expect(await screen.findByText(/no patients registered/i)).toBeInTheDocument();
  });

  it("lists patients with contact info and registered branch", async () => {
    mockedList.mockResolvedValue([
      {
        id: "p1",
        userId: "u2",
        user: { id: "u2", name: "Alice Kumar", email: "alice@example.test", status: "ACTIVE" },
        registeredBranch: { id: "b1", name: "Main Branch" },
      },
    ]);
    renderWithQueryClient(<PatientsPage />);
    expect(await screen.findByText("Alice Kumar")).toBeInTheDocument();
    expect(screen.getByText("alice@example.test")).toBeInTheDocument();
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
  });

  it("registers a patient and refreshes the list", async () => {
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue({ id: "p9", userId: "u9", status: "PENDING_ACTIVATION" });
    const user = userEvent.setup();
    renderWithQueryClient(<PatientsPage />);

    await screen.findByText(/no patients registered/i);
    await user.click(screen.getByRole("button", { name: /register patient/i }));
    await user.type(screen.getByLabelText("Full name"), "New Patient");
    await user.type(screen.getByLabelText("Email"), "newpatient@example.test");
    await user.click(screen.getByRole("button", { name: /^register patient$/i }));

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ hospitalId: "h1", name: "New Patient", email: "newpatient@example.test" }),
      );
    });
  });
});
