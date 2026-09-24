import { fireEvent, screen } from "@testing-library/react-native";
import { renderWithQueryClient } from "@/lib/test-utils";
import MedicalDashboard from "./index";
import MedicalHistory from "./history";
import ConsultationDetails from "./consultations/[id]";
import { consultationsApi, medicalRecordsApi } from "@/lib/resources";
import { useAuth } from "@/lib/auth-context";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ id: "c1" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/resources", () => ({
  medicalRecordsApi: { summary: jest.fn(), list: jest.fn() },
  consultationsApi: { getById: jest.fn() },
}));

const entry = {
  type: "CONSULTATION" as const,
  id: "c1",
  date: "2026-08-02T09:00:00.000Z",
  hospitalId: "h1",
  status: "COMPLETED" as const,
  doctor: { id: "d1", name: "Dr. Patel" },
  department: "Cardiology",
  diagnoses: [{ icd10Code: "I10", description: "Hypertension" }],
};

describe("Medical records screens", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: "token" });
  });

  it("dashboard shows allergies (severe highlighted), conditions and the timeline, and links through", async () => {
    (medicalRecordsApi.summary as jest.Mock).mockResolvedValue({
      patientId: "p1",
      activeConditions: [{ id: "k1", name: "Asthma", status: "CHRONIC" }],
      allergies: [{ id: "a1", allergen: "Penicillin", reaction: "Rash", severity: "SEVERE" }],
      consultationCount: 5,
      recentConsultations: [entry],
      activePrescriptionCount: 2,
    });
    renderWithQueryClient(<MedicalDashboard />);

    expect(await screen.findByText("Penicillin — SEVERE (Rash)")).toBeTruthy();
    expect(screen.getByText("Asthma · CHRONIC")).toBeTruthy();
    expect(screen.getByText("Active prescriptions: 2")).toBeTruthy();

    fireEvent.press(screen.getByText(/Dr\. Patel/));
    expect(mockPush).toHaveBeenCalledWith("/records/consultations/c1");
    fireEvent.press(screen.getByText("View full history"));
    expect(mockPush).toHaveBeenCalledWith("/records/history");
  });

  it("dashboard shows an error state when the summary fails", async () => {
    (medicalRecordsApi.summary as jest.Mock).mockRejectedValue(new Error("boom"));
    renderWithQueryClient(<MedicalDashboard />);
    expect(await screen.findByText(/couldn't load your records/i)).toBeTruthy();
  });

  it("history lists records and shows an empty state", async () => {
    (medicalRecordsApi.list as jest.Mock).mockResolvedValueOnce([entry]).mockResolvedValue([]);
    const first = renderWithQueryClient(<MedicalHistory />);
    expect(await screen.findByText(/Diagnosis: Hypertension/)).toBeTruthy();
    first.unmount();

    renderWithQueryClient(<MedicalHistory />);
    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("consultation details show vitals, diagnosis and notes read-only", async () => {
    (consultationsApi.getById as jest.Mock).mockResolvedValue({
      id: "c1",
      status: "COMPLETED",
      startedAt: "2026-08-02T09:00:00.000Z",
      doctor: { id: "d1", user: { id: "u1", name: "Dr. Patel" } },
      appointment: { id: "a1", startTime: "2026-08-02T09:00:00.000Z", department: { id: "dep1", name: "Cardiology" } },
      clinicalNotes: [{ id: "n1", content: "Patient reports mild headaches." }],
      diagnoses: [{ id: "g1", icd10Code: "I10", description: "Hypertension" }],
      vitals: [{ id: "v1", bloodPressureSystolic: 128, bloodPressureDiastolic: 82, heartRate: 76, temperatureCelsius: "36.8", weightKg: "72", spo2: null }],
    });
    renderWithQueryClient(<ConsultationDetails />);

    expect(await screen.findByText("BP 128/82 · HR 76 · Temp 36.8°C · Wt 72kg")).toBeTruthy();
    expect(screen.getByText("Hypertension (I10)")).toBeTruthy();
    expect(screen.getByText("Patient reports mild headaches.")).toBeTruthy();
  });

  it("consultation details show a not-found state on failure", async () => {
    (consultationsApi.getById as jest.Mock).mockRejectedValue(new Error("404"));
    renderWithQueryClient(<ConsultationDetails />);
    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
  });
});
