import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { loginAction } from "./actions";

const push = jest.fn();
const setSession = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ setSession }) }));
jest.mock("./actions", () => ({ loginAction: jest.fn() }));

const mockedLoginAction = loginAction as jest.Mock;

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in form", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email or phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows field validation errors and does not submit when the form is empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email or phone is required/i)).toBeInTheDocument();
    expect(mockedLoginAction).not.toHaveBeenCalled();
  });

  it("shows a generic error banner when the API rejects the credentials", async () => {
    mockedLoginAction.mockResolvedValue({
      ok: false,
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Incorrect email/phone or password.",
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email or phone/i), "doctor@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect email\/phone or password/i);
    expect(setSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("establishes the session and redirects on success", async () => {
    mockedLoginAction.mockResolvedValue({
      ok: true,
      accessToken: "access-token",
      user: { id: "u1", name: "Dr. Patel", roles: ["DOCTOR"], permissions: [] },
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email or phone/i), "doctor@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(setSession).toHaveBeenCalledWith("access-token", expect.objectContaining({ id: "u1" }));
      expect(push).toHaveBeenCalledWith("/");
    });
  });
});
