import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import OtpVerify from "./otp-verify";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {
  otpChallengeId: "challenge-1",
  deliveredTo: "j***@example.com",
  purpose: "REGISTRATION",
};
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/lib/api-client");
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));

const mockedApiFetch = apiFetch as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockSetSession = jest.fn();

function typeCode(code: string) {
  for (let i = 0; i < code.length; i++) {
    fireEvent.changeText(screen.getByLabelText(`Digit ${i + 1} of 6`), code[i]);
  }
}

describe("OtpVerify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ setSession: mockSetSession });
    mockParams = { otpChallengeId: "challenge-1", deliveredTo: "j***@example.com", purpose: "REGISTRATION" };
  });

  it("renders the masked destination and 6 digit boxes", () => {
    render(<OtpVerify />);
    expect(screen.getByText("We sent a code to j***@example.com")).toBeTruthy();
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i} of 6`)).toBeTruthy();
    }
  });

  it("auto-submits on the 6th digit and establishes a session for a REGISTRATION purpose", async () => {
    mockedApiFetch.mockResolvedValue({
      purpose: "REGISTRATION",
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: { id: "u1", name: "Jane Patient", roles: ["PATIENT"], permissions: [] },
      },
    });

    render(<OtpVerify />);
    typeCode("123456");

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/auth/verify-otp", {
        method: "POST",
        body: { otpChallengeId: "challenge-1", code: "123456" },
      });
      expect(mockSetSession).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("routes to reset-password carrying the code forward for a PASSWORD_RESET purpose", async () => {
    mockParams = { otpChallengeId: "challenge-1", deliveredTo: "j***@example.com", purpose: "PASSWORD_RESET" };
    mockedApiFetch.mockResolvedValue({ purpose: "PASSWORD_RESET", verified: true });

    render(<OtpVerify />);
    typeCode("123456");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/reset-password",
        params: { otpChallengeId: "challenge-1", code: "123456" },
      });
    });
  });

  it("shows an incorrect-code error and clears the input", async () => {
    mockedApiFetch.mockRejectedValue(new ApiError("AUTH_OTP_INVALID", "Incorrect code."));

    render(<OtpVerify />);
    typeCode("111111");

    await waitFor(() => expect(screen.getByText("Incorrect code.")).toBeTruthy());
    expect(screen.getByLabelText("Digit 1 of 6").props.value).toBe("");
  });
});
