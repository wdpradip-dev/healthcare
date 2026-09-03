import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "./page";
import { resetPasswordAction } from "./actions";

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock("./actions", () => ({ resetPasswordAction: jest.fn() }));

const mockedResetPasswordAction = resetPasswordAction as jest.Mock;

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams = new URLSearchParams({
      challengeId: "11111111-1111-1111-1111-111111111111",
      deliveredTo: "d***@example.com",
    });
  });

  it("renders the form with the masked destination from the query string", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByText(/d\*\*\*@example\.com/)).toBeInTheDocument();
  });

  it("shows a validation error for a malformed code", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/6-digit code/i), "12");
    await user.type(screen.getByLabelText(/new password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText(/code must be 6 digits/i)).toBeInTheDocument();
    expect(mockedResetPasswordAction).not.toHaveBeenCalled();
  });

  it("shows a generic error banner on an invalid/expired code, without leaking account existence", async () => {
    mockedResetPasswordAction.mockResolvedValue({ ok: false, message: "Invalid or already-used code." });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.type(screen.getByLabelText(/new password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or already-used code/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("submits the challenge id from the query string and redirects to login on success", async () => {
    mockedResetPasswordAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.type(screen.getByLabelText(/new password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedResetPasswordAction).toHaveBeenCalledWith({
        code: "123456",
        newPassword: "Password1",
        otpChallengeId: "11111111-1111-1111-1111-111111111111",
      });
      expect(push).toHaveBeenCalledWith("/login");
    });
  });
});
