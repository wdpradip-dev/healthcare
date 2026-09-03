import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import ForgotPassword from "./forgot-password";
import { apiFetch, ApiError } from "@/lib/api-client";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
}));
jest.mock("@/lib/api-client");

const mockedApiFetch = apiFetch as jest.Mock;

describe("ForgotPassword", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the form", () => {
    render(<ForgotPassword />);
    expect(screen.getByText("Reset your password")).toBeTruthy();
    expect(screen.getByLabelText("Email or phone")).toBeTruthy();
  });

  it("shows an error banner when the request fails", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError("RATE_LIMITED", "Too many requests. Try again later."));

    render(<ForgotPassword />);
    fireEvent.changeText(screen.getByLabelText("Email or phone"), "doctor@example.com");
    fireEvent.press(screen.getByText("Send Code"));

    await waitFor(() => expect(screen.getByText("Too many requests. Try again later.")).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to OTP verification with the challenge id on success", async () => {
    mockedApiFetch.mockResolvedValue({ otpChallengeId: "challenge-1", otpDeliveredTo: "d***@example.com" });

    render(<ForgotPassword />);
    fireEvent.changeText(screen.getByLabelText("Email or phone"), "doctor@example.com");
    fireEvent.press(screen.getByText("Send Code"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/otp-verify",
        params: { otpChallengeId: "challenge-1", deliveredTo: "d***@example.com", purpose: "PASSWORD_RESET" },
      });
    });
  });
});
