import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import NotificationsAdminPage from "./page";
import { notificationsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", roles: ["ADMIN"], permissions: ["notifications.manage"] } }),
}));
jest.mock("@/lib/resources", () => ({ notificationsApi: { health: jest.fn(), templates: jest.fn(), upsertTemplate: jest.fn() } }));
jest.mock("@/lib/api-client");

const health = notificationsApi.health as jest.Mock;
const templates = notificationsApi.templates as jest.Mock;
const upsertTemplate = notificationsApi.upsertTemplate as jest.Mock;

describe("NotificationsAdminPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows delivery health with a computed success rate", async () => {
    health.mockResolvedValue([{ event: "APPOINTMENT_BOOKED", channel: "EMAIL", total: 10, sent: 9, failed: 1, queued: 0 }]);
    renderWithQueryClient(<NotificationsAdminPage />);

    expect(await screen.findByText("Appointment booked")).toBeInTheDocument();
    expect(screen.getByText("90% (9/10)")).toBeInTheDocument();
  });

  it("lists templates grouped by event and saves an edit", async () => {
    health.mockResolvedValue([]);
    templates.mockResolvedValue([
      { key: "APPOINTMENT_BOOKED", channel: "EMAIL", subject: "Confirmed", body: "Hi {{doctorName}}", isDefault: true, updatedAt: null },
      { key: "APPOINTMENT_BOOKED", channel: "IN_APP", subject: null, body: "Booked", isDefault: true, updatedAt: null },
    ]);
    upsertTemplate.mockResolvedValue({ key: "APPOINTMENT_BOOKED", channel: "EMAIL", subject: "New subject", body: "New body", isDefault: false, updatedAt: "2026-09-01T00:00:00Z" });

    const user = userEvent.setup();
    renderWithQueryClient(<NotificationsAdminPage />);
    await user.click(screen.getByRole("tab", { name: "Templates" }));

    expect(await screen.findByText("EMAIL (default)")).toBeInTheDocument();
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]!);

    const bodyField = screen.getByLabelText("Body");
    await user.clear(bodyField);
    await user.type(bodyField, "New body");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsertTemplate).toHaveBeenCalledWith("token", "APPOINTMENT_BOOKED", { channel: "EMAIL", subject: "Confirmed", body: "New body" }));
  });
});
