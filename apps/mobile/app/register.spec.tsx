import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import Register from "./register";
import { apiFetch, ApiError } from "@/lib/api-client";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
}));
jest.mock("@/lib/api-client");

const mockedApiFetch = apiFetch as jest.Mock;

describe("Register", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the form with submit disabled until terms are accepted", () => {
    render(<Register />);
    expect(screen.getByText("Create your account")).toBeTruthy();
    expect(screen.getByLabelText("I agree to the Terms of Service and Privacy Policy")).toBeTruthy();
  });

  it("shows AUTH_EMAIL_ALREADY_EXISTS as a form error", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError("AUTH_EMAIL_ALREADY_EXISTS", "This email or phone is already registered."));

    render(<Register />);
    fireEvent.changeText(screen.getByLabelText("Full name"), "Jane Patient");
    fireEvent.changeText(screen.getByLabelText("Email"), "jane@example.com");
    fireEvent.changeText(screen.getByLabelText("Phone"), "+15551234567");
    fireEvent.changeText(screen.getByLabelText("Password"), "Password1");
    fireEvent.press(screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"));
    fireEvent.press(screen.getByText("Create Account"));

    await waitFor(() => expect(screen.getByText("This email or phone is already registered.")).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to OTP verification (registration mode) on success", async () => {
    mockedApiFetch.mockResolvedValue({
      userId: "u1",
      status: "PENDING_ACTIVATION",
      otpChallengeId: "challenge-1",
      otpDeliveredTo: "j***@example.com",
    });

    render(<Register />);
    fireEvent.changeText(screen.getByLabelText("Full name"), "Jane Patient");
    fireEvent.changeText(screen.getByLabelText("Email"), "jane@example.com");
    fireEvent.changeText(screen.getByLabelText("Phone"), "+15551234567");
    fireEvent.changeText(screen.getByLabelText("Password"), "Password1");
    fireEvent.press(screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"));
    fireEvent.press(screen.getByText("Create Account"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/otp-verify",
        params: { otpChallengeId: "challenge-1", deliveredTo: "j***@example.com", purpose: "REGISTRATION" },
      });
    });
  });
});
