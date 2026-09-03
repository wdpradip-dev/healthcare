import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivateAccountPage from "./page";
import { activateAccountAction, requestActivationOtpAction } from "./actions";

const mockPush = jest.fn();
let mockParams = new URLSearchParams({ token: "activation-token" });
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}));
jest.mock("./actions", () => ({ requestActivationOtpAction: jest.fn(), activateAccountAction: jest.fn() }));

const mockedRequestOtp = requestActivationOtpAction as jest.Mock;
const mockedActivate = activateAccountAction as jest.Mock;

describe("ActivateAccountPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams({ token: "activation-token" });
  });

  it("requests the OTP automatically and shows the masked destination", async () => {
    mockedRequestOtp.mockResolvedValue({ ok: true, otpChallengeId: "c1", otpDeliveredTo: "n***@example.com" });
    render(<ActivateAccountPage />);
    expect(await screen.findByText(/n\*\*\*@example\.com/)).toBeInTheDocument();
    expect(mockedRequestOtp).toHaveBeenCalledWith("activation-token");
  });

  it("shows an error screen for an invalid/expired token", async () => {
    mockedRequestOtp.mockResolvedValue({ ok: false, message: "This activation link is invalid or has expired." });
    render(<ActivateAccountPage />);
    expect(await screen.findByText(/activation link invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/ask your admin to send a new invite/i)).toBeInTheDocument();
  });

  it("submits the code and password, then redirects to login on success", async () => {
    mockedRequestOtp.mockResolvedValue({ ok: true, otpChallengeId: "c1", otpDeliveredTo: "n***@example.com" });
    mockedActivate.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ActivateAccountPage />);

    await screen.findByText(/n\*\*\*@example\.com/);
    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.type(screen.getByLabelText("Password"), "Password1");
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    await waitFor(() => {
      expect(mockedActivate).toHaveBeenCalledWith({
        activationToken: "activation-token",
        otpChallengeId: "c1",
        code: "123456",
        password: "Password1",
      });
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
