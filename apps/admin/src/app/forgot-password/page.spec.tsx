import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./page";
import { forgotPasswordAction } from "./actions";

const push = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("./actions", () => ({ forgotPasswordAction: jest.fn() }));

const mockedForgotPasswordAction = forgotPasswordAction as jest.Mock;

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("heading", { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email or phone/i)).toBeInTheDocument();
  });

  it("shows an error banner when the request fails", async () => {
    mockedForgotPasswordAction.mockResolvedValue({ ok: false, message: "Too many requests. Try again later." });
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email or phone/i), "doctor@example.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many requests/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to reset-password with the challenge id on success, without revealing account existence", async () => {
    mockedForgotPasswordAction.mockResolvedValue({
      ok: true,
      otpChallengeId: "11111111-1111-1111-1111-111111111111",
      otpDeliveredTo: "d***@example.com",
    });
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email or phone/i), "doctor@example.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/reset-password?deliveredTo=d***%40example.com&challengeId=11111111-1111-1111-1111-111111111111",
      );
    });
  });
});
