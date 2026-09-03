import { render, screen, fireEvent } from "@testing-library/react-native";
import Welcome from "./welcome";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

describe("Welcome", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the two primary actions", () => {
    render(<Welcome />);
    expect(screen.getByText("Hospital Platform")).toBeTruthy();
    expect(screen.getByText("Create Account")).toBeTruthy();
    expect(screen.getByText("Log In")).toBeTruthy();
  });

  it("navigates to register and login", () => {
    render(<Welcome />);
    fireEvent.press(screen.getByText("Create Account"));
    expect(mockPush).toHaveBeenCalledWith("/register");
    fireEvent.press(screen.getByText("Log In"));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
