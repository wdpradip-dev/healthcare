import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import Notifications from "./index";
import { notificationsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({
  notificationsApi: { list: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn(), preferences: jest.fn(), updatePreferences: jest.fn() },
}));

const list = notificationsApi.list as jest.Mock;
const markRead = notificationsApi.markRead as jest.Mock;
const markAllRead = notificationsApi.markAllRead as jest.Mock;
const preferences = notificationsApi.preferences as jest.Mock;
const updatePreferences = notificationsApi.updatePreferences as jest.Mock;

const row = {
  id: "n1",
  type: "APPOINTMENT_BOOKED",
  title: "Appointment confirmed",
  body: "Your appointment with Dr. Patel is confirmed.",
  channel: "IN_APP" as const,
  relatedEntityType: "Appointment",
  relatedEntityId: "a1",
  readAt: null,
  createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
};

describe("Notifications screen", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: "token" });
    preferences.mockResolvedValue({});
  });

  it("shows the empty state when there is nothing to see", async () => {
    list.mockResolvedValue([]);
    renderWithQueryClient(<Notifications />);
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });

  it("marks a notification read and deep-links to its source on tap", async () => {
    list.mockResolvedValue([row]);
    markRead.mockResolvedValue({ ...row, readAt: new Date().toISOString() });
    renderWithQueryClient(<Notifications />);

    const item = await screen.findByLabelText(/Unread, Appointment confirmed/);
    fireEvent.press(item);

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("token", "n1"));
    expect(mockPush).toHaveBeenCalledWith("/appointments/a1");
  });

  it("marks all read", async () => {
    list.mockResolvedValue([row]);
    markAllRead.mockResolvedValue({ updated: 1 });
    renderWithQueryClient(<Notifications />);

    fireEvent.press(await screen.findByText("Mark all read"));
    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith("token"));
  });

  it("toggles a preference optimistically", async () => {
    list.mockResolvedValue([]);
    updatePreferences.mockResolvedValue({ push: false });
    renderWithQueryClient(<Notifications />);

    await screen.findByText("Push notifications");
    fireEvent(screen.getAllByRole("switch")[0]!, "valueChange", false);

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith("token", expect.objectContaining({ push: false })));
  });
});
