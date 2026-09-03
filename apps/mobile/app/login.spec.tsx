import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import Login from "./login";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));
jest.mock("@/lib/api-client");
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));

const mockedApiFetch = apiFetch as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockSetSession = jest.fn();

describe("Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ setSession: mockSetSession });
  });

  it("renders the sign-in form", () => {
    render(<Login />);
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByLabelText("Email or phone")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("shows an error banner when the API rejects the credentials", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError("AUTH_INVALID_CREDENTIALS", "Incorrect email/phone or password."));

    render(<Login />);
    fireEvent.changeText(screen.getByLabelText("Email or phone"), "doctor@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "wrong-password");
    fireEvent.press(screen.getByText("Log In"));

    await waitFor(() => {
      expect(screen.getByText("Incorrect email/phone or password.")).toBeTruthy();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("establishes the session and navigates home on success", async () => {
    mockedApiFetch.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "u1", name: "Jane Patient", roles: ["PATIENT"], permissions: [] },
    });

    render(<Login />);
    fireEvent.changeText(screen.getByLabelText("Email or phone"), "jane@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "Password1");
    fireEvent.press(screen.getByText("Log In"));

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "access-token", user: expect.objectContaining({ id: "u1" }) }),
      );
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });
});
