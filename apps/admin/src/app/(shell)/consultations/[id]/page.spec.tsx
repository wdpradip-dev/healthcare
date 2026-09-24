import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import ConsultationWorkspacePage from "./page";
import { consultationsApi, type ConsultationDetail } from "@/lib/resources";

let mockUser = {
  id: "u1",
  name: "Dr. Patel",
  hospitalId: "h1",
  roles: ["DOCTOR"],
  permissions: ["consultations.read", "consultations.write", "medical_records.write"],
  doctorId: "d1" as string | null,
};

const mockPush = jest.fn();
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ accessToken: "token", user: mockUser }) }));
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));
jest.mock("@/lib/resources", () => ({
  consultationsApi: { getById: jest.fn(), update: jest.fn(), updateVitals: jest.fn(), complete: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedGet = consultationsApi.getById as jest.Mock;
const mockedUpdate = consultationsApi.update as jest.Mock;
const mockedUpdateVitals = consultationsApi.updateVitals as jest.Mock;
const mockedComplete = consultationsApi.complete as jest.Mock;

function consultation(overrides: Partial<ConsultationDetail> = {}): ConsultationDetail {
  return {
    id: "c1",
    appointmentId: "a1",
    hospitalId: "h1",
    status: "IN_PROGRESS",
    startedAt: "2026-08-08T09:00:00.000Z",
    completedAt: null,
    doctor: { id: "d1", userId: "u1", user: { id: "u1", name: "Dr. Patel" } },
    patient: { id: "p1", userId: "u3", user: { id: "u3", name: "Alice Kumar" } },
    appointment: { id: "a1", startTime: "2026-08-08T09:00:00.000Z", department: { id: "dep1", name: "Cardiology" } },
    clinicalNotes: [],
    diagnoses: [],
    vitals: [],
    ...overrides,
  };
}

describe("ConsultationWorkspacePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: "u1",
      name: "Dr. Patel",
      hospitalId: "h1",
      roles: ["DOCTOR"],
      permissions: ["consultations.read", "consultations.write", "medical_records.write"],
      doctorId: "d1",
    };
    mockedGet.mockResolvedValue(consultation());
  });

  it("renders the patient and keeps Complete disabled until there is a note or diagnosis", async () => {
    renderWithQueryClient(<ConsultationWorkspacePage />);

    expect(await screen.findByText(/Alice Kumar · Consultation/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
  });

  it("saves notes, diagnoses and vitals together", async () => {
    mockedUpdate.mockResolvedValue(consultation());
    const user = userEvent.setup();
    renderWithQueryClient(<ConsultationWorkspacePage />);
    await screen.findByText(/Alice Kumar · Consultation/);

    await user.type(screen.getByLabelText("Heart rate (bpm)"), "76");
    await user.click(screen.getByRole("tab", { name: "notes" }));
    await user.click(screen.getByRole("button", { name: "+ Add Note" }));
    await user.type(screen.getByLabelText("Clinical note"), "Mild headaches.");
    await user.click(screen.getByLabelText(/internal only/i));
    await user.click(screen.getByRole("tab", { name: "diagnosis" }));
    await user.click(screen.getByRole("button", { name: "+ Add Diagnosis" }));
    await user.type(screen.getByLabelText("ICD-10 code (optional)"), "I10");
    await user.type(screen.getByLabelText("Diagnosis"), "Hypertension");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("token", "c1", {
        notes: [{ id: undefined, content: "Mild headaches.", isInternal: true }],
        diagnoses: [{ icd10Code: "I10", description: "Hypertension" }],
        vitals: { heartRate: 76 },
      }),
    );
  });

  it("completes behind a confirmation that warns the record becomes patient-visible", async () => {
    mockedGet.mockResolvedValue(consultation({ diagnoses: [{ id: "g1", icd10Code: null, description: "Viral fever" }] }));
    mockedComplete.mockResolvedValue(consultation({ status: "COMPLETED" }));
    const user = userEvent.setup();
    renderWithQueryClient(<ConsultationWorkspacePage />);
    await screen.findByText(/Alice Kumar · Consultation/);

    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText(/visible to the patient/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm & complete/i }));

    await waitFor(() => expect(mockedComplete).toHaveBeenCalledWith("token", "c1"));
    expect(mockPush).toHaveBeenCalledWith("/appointments");
  });

  it("gives a Nurse the Vitals tab only for editing: no Complete, vitals save via the vitals route", async () => {
    mockUser = { id: "n1", name: "Nina Nurse", hospitalId: "h1", roles: ["NURSE"], permissions: ["consultations.read", "medical_records.write"], doctorId: null };
    mockedUpdateVitals.mockResolvedValue(consultation());
    const user = userEvent.setup();
    renderWithQueryClient(<ConsultationWorkspacePage />);
    await screen.findByText(/Alice Kumar · Consultation/);

    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("BP systolic (mmHg)"), "120");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockedUpdateVitals).toHaveBeenCalledWith("token", "c1", { bloodPressureSystolic: 120 }));
    expect(mockedUpdate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "notes" }));
    expect(screen.queryByRole("button", { name: "+ Add Note" })).not.toBeInTheDocument();
  });

  it("shows other authors' notes read-only, flagging internal ones", async () => {
    mockedGet.mockResolvedValue(
      consultation({ clinicalNotes: [{ id: "n9", authorId: "someone-else", content: "Watch for arrhythmia", isInternal: true, createdAt: "2026-08-08T09:05:00.000Z" }] }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<ConsultationWorkspacePage />);
    await screen.findByText(/Alice Kumar · Consultation/);

    await user.click(screen.getByRole("tab", { name: "notes" }));

    expect(screen.getByText("Watch for arrhythmia")).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
  });

  it("is read-only once the consultation is completed", async () => {
    mockedGet.mockResolvedValue(consultation({ status: "COMPLETED", completedAt: "2026-08-08T09:30:00.000Z" }));
    renderWithQueryClient(<ConsultationWorkspacePage />);

    expect(await screen.findByText(/closed — read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Heart rate (bpm)")).toBeDisabled();
  });
});
