import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import PrescriptionList from "./prescriptions/index";
import PrescriptionDetails from "./prescriptions/[id]";
import ReportList from "./reports/index";
import ReportDetails from "./reports/[id]";
import Documents from "./documents/index";
import { documentsApi, prescriptionsApi, reportsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";
import { Linking } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ id: "x1" }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  resolveFileUrl: (url: string) => url,
}));
jest.mock("@/lib/resources", () => ({
  prescriptionsApi: { list: jest.fn(), getById: jest.fn(), pdfUrl: jest.fn() },
  reportsApi: { list: jest.fn(), getById: jest.fn(), fileUrl: jest.fn() },
  documentsApi: { list: jest.fn(), upload: jest.fn(), downloadUrl: jest.fn() },
}));

const rx = {
  id: "x1",
  status: "ACTIVE",
  issuedAt: "2026-09-01T09:00:00.000Z",
  doctor: { id: "d1", user: { name: "Dr. Patel" } },
  items: [{ id: "i1", freeTextName: "Amoxicillin", dosage: "500mg", frequency: "daily", durationDays: 5, instructions: null, medication: null }],
};

describe("Phase 9 patient screens", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: "token" });
  });

  it("lists prescriptions and opens one", async () => {
    (prescriptionsApi.list as jest.Mock).mockResolvedValue([rx]);
    renderWithQueryClient(<PrescriptionList />);
    fireEvent.press(await screen.findByText(/Dr\. Patel/));
    expect(mockPush).toHaveBeenCalledWith("/prescriptions/x1");
  });

  it("shows prescription details and opens the signed PDF", async () => {
    (prescriptionsApi.getById as jest.Mock).mockResolvedValue(rx);
    (prescriptionsApi.pdfUrl as jest.Mock).mockResolvedValue({ url: "https://files.test/rx.pdf" });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderWithQueryClient(<PrescriptionDetails />);

    expect(await screen.findByText("Amoxicillin")).toBeTruthy();
    fireEvent.press(screen.getByText("Download PDF"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.test/rx.pdf"));
  });

  it("lists released reports and explains the empty state", async () => {
    (reportsApi.list as jest.Mock).mockResolvedValue([]);
    renderWithQueryClient(<ReportList />);
    expect(await screen.findByText(/once your doctor has reviewed them/)).toBeTruthy();
  });

  it("always shows the AI provenance label with the summary", async () => {
    (reportsApi.getById as jest.Mock).mockResolvedValue({
      id: "x1",
      type: "lab",
      title: "CBC",
      structuredValues: { Hemoglobin: { value: 13.2, unit: "g/dL", referenceRange: "12-16" } },
      findings: null,
      aiSummary: { text: "Within range.", aiGenerated: true, reviewedBy: "Dr. Patel" },
      verifiedByName: "Dr. Patel",
      releasedAt: "2026-09-01T09:00:00.000Z",
    });
    renderWithQueryClient(<ReportDetails />);

    expect(await screen.findByText("Within range.")).toBeTruthy();
    expect(screen.getByText(/AI-Assisted Summary — reviewed by Dr\. Patel/)).toBeTruthy();
    expect(screen.getByText("Reference: 12-16")).toBeTruthy();
  });

  it("omits the AI block when the report has no summary", async () => {
    (reportsApi.getById as jest.Mock).mockResolvedValue({
      id: "x1",
      type: "imaging",
      title: "Chest X-ray",
      structuredValues: null,
      findings: "Lungs clear.",
      aiSummary: null,
      verifiedByName: "Dr. Patel",
      releasedAt: null,
    });
    renderWithQueryClient(<ReportDetails />);
    expect(await screen.findByText("Lungs clear.")).toBeTruthy();
    expect(screen.queryByText(/AI-Assisted Summary/)).toBeNull();
  });

  it("lists documents and opens one through a signed URL", async () => {
    (documentsApi.list as jest.Mock).mockResolvedValue([
      { id: "d1", category: "ID_PROOF", fileName: "passport.png", mimeType: "image/png", sizeBytes: 100, createdAt: "2026-09-01T09:00:00.000Z" },
    ]);
    (documentsApi.downloadUrl as jest.Mock).mockResolvedValue({ url: "https://files.test/d1" });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderWithQueryClient(<Documents />);

    fireEvent.press(await screen.findByText("passport.png"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.test/d1"));
    expect(documentsApi.downloadUrl).toHaveBeenCalledWith("token", "d1");
  });
});
