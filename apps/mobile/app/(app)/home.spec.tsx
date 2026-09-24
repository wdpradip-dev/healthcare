import { fireEvent, screen } from "@testing-library/react-native";
import { render } from "@testing-library/react-native";
import Home from "./home";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));

const mockedUseAuth = useAuth as jest.Mock;
const mockClearSession = jest.fn();

describe("Home", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { id: "u1", name: "Alice Kumar" }, clearSession: mockClearSession });
  });

  it("greets the signed-in patient", () => {
    render(<Home />);
    expect(screen.getByText("Good day, Alice Kumar")).toBeTruthy();
  });

  it("navigates to doctors, departments, and appointments", () => {
    render(<Home />);
    fireEvent.press(screen.getByText("Find a Doctor"));
    expect(mockPush).toHaveBeenCalledWith("/doctors");
    fireEvent.press(screen.getByText("Browse Departments"));
    expect(mockPush).toHaveBeenCalledWith("/departments");
    fireEvent.press(screen.getByText("My Appointments"));
    expect(mockPush).toHaveBeenCalledWith("/appointments");
    fireEvent.press(screen.getByText("My Records"));
    expect(mockPush).toHaveBeenCalledWith("/records");
  });

  it("logs out", () => {
    render(<Home />);
    fireEvent.press(screen.getByText("Log Out"));
    expect(mockClearSession).toHaveBeenCalled();
  });
});
