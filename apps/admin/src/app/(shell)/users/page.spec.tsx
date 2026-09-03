import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import UsersPage from "./page";
import { usersApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: [] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({ usersApi: { list: jest.fn(), invite: jest.fn(), deactivate: jest.fn() } }));
jest.mock("@/lib/api-client");

const mockedList = usersApi.list as jest.Mock;
const mockedInvite = usersApi.invite as jest.Mock;
const mockedDeactivate = usersApi.deactivate as jest.Mock;

describe("UsersPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state when no staff have been invited", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<UsersPage />);
    expect(await screen.findByText(/no staff invited yet/i)).toBeInTheDocument();
  });

  it("lists users with their roles and a Deactivate action", async () => {
    mockedList.mockResolvedValue([
      {
        id: "u2",
        name: "Nina Nurse",
        email: "nina@example.test",
        status: "ACTIVE",
        userRoles: [{ role: { key: "NURSE" } }],
        staff: null,
      },
    ]);
    renderWithQueryClient(<UsersPage />);
    expect(await screen.findByText("Nina Nurse")).toBeInTheDocument();
    expect(screen.getByText("NURSE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
  });

  it("hides Deactivate for an already-disabled user", async () => {
    mockedList.mockResolvedValue([
      { id: "u3", name: "Old Staff", email: "old@example.test", status: "DISABLED", userRoles: [], staff: null },
    ]);
    renderWithQueryClient(<UsersPage />);
    await screen.findByText("Old Staff");
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("invites a user and refreshes the list", async () => {
    mockedList.mockResolvedValue([]);
    mockedInvite.mockResolvedValue({ userId: "u4", status: "PENDING_ACTIVATION", roleKey: "NURSE" });
    const user = userEvent.setup();
    renderWithQueryClient(<UsersPage />);

    await screen.findByText(/no staff invited yet/i);
    await user.click(screen.getByRole("button", { name: /invite user/i }));
    await user.type(screen.getByLabelText("Full name"), "Jane Nurse");
    await user.type(screen.getByLabelText("Email"), "jane@example.test");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(mockedInvite).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ hospitalId: "h1", name: "Jane Nurse", email: "jane@example.test", roleKey: "NURSE" }),
      );
    });
  });

  it("deactivates a user on click", async () => {
    mockedList.mockResolvedValue([
      { id: "u5", name: "Bob Staff", email: "bob@example.test", status: "ACTIVE", userRoles: [], staff: null },
    ]);
    mockedDeactivate.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<UsersPage />);

    await screen.findByText("Bob Staff");
    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledWith("token", "u5"));
  });
});
