import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import { ReportDetailsModal } from "./report-details-modal";
import { reportsApi, type ReportRow } from "@/lib/resources";

let mockUser = { id: "u1", name: "Dr. Patel", hospitalId: "h1", roles: ["DOCTOR"], permissions: ["reports.read", "reports.upload", "reports.verify"] };
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ accessToken: "token", user: mockUser }) }));
jest.mock("@/lib/resources", () => ({
  reportsApi: { getById: jest.fn(), update: jest.fn(), analyze: jest.fn(), verify: jest.fn(), fileUrl: jest.fn() },
}));
jest.mock("@/lib/api-client");

const getById = reportsApi.getById as jest.Mock;
const verify = reportsApi.verify as jest.Mock;
const analyze = reportsApi.analyze as jest.Mock;
const update = reportsApi.update as jest.Mock;

function report(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "r1",
    type: "lab",
    title: "CBC",
    patientId: "p1",
    patientName: "Alice Kumar",
    hospitalId: "h1",
    labOrderId: "o1",
    pipelineStatus: "EXTRACTED",
    structuredValues: { Hemoglobin: { value: 13.2, unit: "g/dL", referenceRange: "12-16" } },
    findings: null,
    aiSummary: null,
    verifiedAt: null,
    verifiedByName: null,
    releasedAt: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

const analyzed = () =>
  report({ pipelineStatus: "AI_ANALYZED", aiSummary: { text: "Hemoglobin is in range.", aiGenerated: true, reviewedBy: null } });

describe("ReportDetailsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: "u1", name: "Dr. Patel", hospitalId: "h1", roles: ["DOCTOR"], permissions: ["reports.read", "reports.upload", "reports.verify"] };
    getById.mockResolvedValue(report());
  });

  it("shows the values and lets the doctor release a report that has no AI summary", async () => {
    verify.mockResolvedValue(report({ pipelineStatus: "RELEASED" }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);

    expect(await screen.findByText("Hemoglobin")).toBeInTheDocument();
    expect(screen.queryByLabelText("AI-assisted summary")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Verify & Release/ }));

    await waitFor(() => expect(verify).toHaveBeenCalledWith("token", "r1", {}));
  });

  it("always labels the AI summary and blocks release until a decision is made", async () => {
    getById.mockResolvedValue(analyzed());
    verify.mockResolvedValue(report({ pipelineStatus: "RELEASED" }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);

    const block = await screen.findByLabelText("AI-assisted summary");
    expect(block).toHaveTextContent("AI-Assisted Summary");
    expect(block).toHaveTextContent("not yet reviewed");
    const release = screen.getByRole("button", { name: /Verify & Release/ });
    expect(release).toBeDisabled();

    await user.click(screen.getByLabelText("Discard it"));
    expect(release).toBeEnabled();
    await user.click(release);
    await waitFor(() => expect(verify).toHaveBeenCalledWith("token", "r1", { aiSummaryDecision: "DISCARD" }));
  });

  it("requires the edited text for an EDIT decision", async () => {
    getById.mockResolvedValue(analyzed());
    verify.mockResolvedValue(report({ pipelineStatus: "RELEASED" }));
    const user = userEvent.setup();
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);
    await screen.findByLabelText("AI-assisted summary");

    await user.click(screen.getByLabelText("Edit before release"));
    expect(screen.getByRole("button", { name: /Verify & Release/ })).toBeDisabled();
    await user.type(screen.getByLabelText("Edited AI summary"), "Normal.");
    await user.click(screen.getByRole("button", { name: /Verify & Release/ }));

    await waitFor(() => expect(verify).toHaveBeenCalledWith("token", "r1", { aiSummaryDecision: "EDIT", editedAiSummary: "Normal." }));
  });

  it("names the reviewing doctor once released", async () => {
    getById.mockResolvedValue(
      report({
        pipelineStatus: "RELEASED",
        verifiedByName: "Dr. Patel",
        aiSummary: { text: "In range.", aiGenerated: true, reviewedBy: "Dr. Patel" },
      }),
    );
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);
    expect(await screen.findByLabelText("AI-assisted summary")).toHaveTextContent("reviewed by Dr. Patel");
    expect(screen.queryByRole("button", { name: /Verify & Release/ })).not.toBeInTheDocument();
  });

  it("explains gracefully when AI is unavailable", async () => {
    analyze.mockResolvedValue({ report: report(), aiAvailable: false });
    const user = userEvent.setup();
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: /Generate AI summary/ }));
    expect(await screen.findByText(/AI assistance is unavailable/)).toBeInTheDocument();
  });

  it("lets the doctor enter lab values on a RAW report", async () => {
    getById.mockResolvedValue(report({ pipelineStatus: "RAW", structuredValues: {} }));
    update.mockResolvedValue(report());
    const user = userEvent.setup();
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);

    await user.type(await screen.findByLabelText("Test"), "Hemoglobin");
    await user.type(screen.getByLabelText("Value"), "13.2");
    await user.click(screen.getByRole("button", { name: "Save values" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("token", "r1", { structuredValues: { Hemoglobin: { value: 13.2 } } }));
  });

  it("gives non-doctors no entry or review controls", async () => {
    mockUser = { id: "u2", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: ["reports.read"] };
    renderWithQueryClient(<ReportDetailsModal reportId="r1" onClose={jest.fn()} />);
    await screen.findByText("Hemoglobin");
    expect(screen.queryByRole("button", { name: /Verify & Release/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save values" })).not.toBeInTheDocument();
  });
});
