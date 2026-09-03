import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ResetPassword from "./reset-password";
import { apiFetch } from "@/lib/api-client";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = { otpChallengeId: "challenge-1", code: "123456" };
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/lib/api-client");

const mockedApiFetch = apiFetch as jest.Mock;

describe("ResetPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { otpChallengeId: "challenge-1", code: "123456" };
  });

  it("renders the form", () => {
    render(<ResetPassword />);
    expect(screen.getByText("Set a new password")).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  });

  it("shows a validation error when the passwords do not match", async () => {
    render(<ResetPassword />);
    fireEvent.changeText(screen.getByLabelText("New password"), "Password1");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "Password2");
    fireEvent.press(screen.getByText("Reset Password"));

    await waitFor(() => expect(screen.getByText("Passwords do not match.")).toBeTruthy());
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("submits the challenge id/code carried from OTP verification and redirects to login", async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    render(<ResetPassword />);
    fireEvent.changeText(screen.getByLabelText("New password"), "Password1");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "Password1");
    fireEvent.press(screen.getByText("Reset Password"));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/auth/reset-password", {
        method: "POST",
        body: { otpChallengeId: "challenge-1", code: "123456", newPassword: "Password1" },
      });
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });
});
