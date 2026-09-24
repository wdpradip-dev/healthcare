import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import ReportsPage from "./page";
import { reportsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", roles: ["ADMIN"], permissions: ["reports.read"] } }),
}));
jest.mock("@/lib/resources", () => ({ reportsApi: { list: jest.fn(), getById: jest.fn() } }));
jest.mock("@/lib/api-client");
jest.mock("@/components/appointments/appointment-details-modal", () => ({ formatDateTime: () => "1 Sep 2026" }));

const list = reportsApi.list as jest.Mock;

describe("ReportsPage", () => {
  it("lists reports with their pipeline stage", async () => {
    list.mockResolvedValue([
      { id: "r1", type: "lab", title: "CBC", patientName: "Alice Kumar", pipelineStatus: "RELEASED", createdAt: "2026-09-01T00:00:00Z" },
    ]);
    renderWithQueryClient(<ReportsPage />);
    expect(await screen.findByText("Alice Kumar")).toBeInTheDocument();
    expect(screen.getAllByText("Released to patient").length).toBeGreaterThan(0);
  });

  it("passes the filters to the API", async () => {
    list.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithQueryClient(<ReportsPage />);
    await user.selectOptions(await screen.findByLabelText("Type"), "imaging");
    expect(list).toHaveBeenLastCalledWith("token", { type: "imaging", status: "" });
    expect(await screen.findByText("No reports found.")).toBeInTheDocument();
  });
});
