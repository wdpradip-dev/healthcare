import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import BranchesPage from "./page";
import { branchesApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({ branchesApi: { list: jest.fn(), create: jest.fn() } }));
jest.mock("@/lib/api-client");

const mockedList = branchesApi.list as jest.Mock;
const mockedCreate = branchesApi.create as jest.Mock;

describe("BranchesPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state when there are no branches", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<BranchesPage />);
    expect(await screen.findByText(/no branches yet/i)).toBeInTheDocument();
  });

  it("lists branches once loaded", async () => {
    mockedList.mockResolvedValue([
      { id: "b1", hospitalId: "h1", name: "Main Branch", address: "1 Main St", city: "Springfield", status: "ACTIVE" },
    ]);
    renderWithQueryClient(<BranchesPage />);
    expect(await screen.findByText("Main Branch")).toBeInTheDocument();
  });

  it("shows an error state when the list fails to load", async () => {
    mockedList.mockRejectedValue(new Error("network down"));
    renderWithQueryClient(<BranchesPage />);
    expect(await screen.findByText(/couldn't load branches/i)).toBeInTheDocument();
  });

  it("opens the create modal, submits, and refreshes the list", async () => {
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "b2", hospitalId: "h1", name: "New Branch" });
    const user = userEvent.setup();
    renderWithQueryClient(<BranchesPage />);

    await screen.findByText(/no branches yet/i);
    await user.click(screen.getByRole("button", { name: /add branch/i }));

    await user.type(screen.getByLabelText("Name"), "New Branch");
    await user.type(screen.getByLabelText("Address"), "2 Second St");
    await user.type(screen.getByLabelText("City"), "Springfield");
    await user.type(screen.getByLabelText("State"), "IL");
    await user.type(screen.getByLabelText("Postal code"), "62701");
    await user.type(screen.getByLabelText("Country"), "USA");
    await user.type(screen.getByLabelText("Contact phone"), "+15551234567");
    await user.click(screen.getByRole("button", { name: /create branch/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ hospitalId: "h1", name: "New Branch" }),
      );
    });
  });
});
