import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import PatientsPage from "./page";
import { medicalRecordsApi, patientsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", name: "Admin", hospitalId: "h1", roles: ["ADMIN"], permissions: ["medical_records.read"] } }),
}));
jest.mock("@/lib/hospital-scope", () => ({ useHospitalScope: () => ({ selectedHospitalId: "h1", setSelectedHospitalId: jest.fn() }) }));
jest.mock("@/lib/resources", () => ({
  patientsApi: { list: jest.fn(), register: jest.fn(), update: jest.fn() },
  medicalRecordsApi: { list: jest.fn(), allergies: jest.fn(), conditions: jest.fn() },
}));
jest.mock("@/lib/api-client");

const mockedList = patientsApi.list as jest.Mock;
const mockedRegister = patientsApi.register as jest.Mock;

describe("PatientsPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows an empty state when no patients are registered", async () => {
    mockedList.mockResolvedValue([]);
    renderWithQueryClient(<PatientsPage />);
    expect(await screen.findByText(/no patients registered/i)).toBeInTheDocument();
  });

  it("lists patients with contact info and registered branch", async () => {
    mockedList.mockResolvedValue([
      {
        id: "p1",
        userId: "u2",
        user: { id: "u2", name: "Alice Kumar", email: "alice@example.test", status: "ACTIVE" },
        registeredBranch: { id: "b1", name: "Main Branch" },
      },
    ]);
    renderWithQueryClient(<PatientsPage />);
    expect(await screen.findByText("Alice Kumar")).toBeInTheDocument();
    expect(screen.getByText("alice@example.test")).toBeInTheDocument();
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
  });

  it("registers a patient and refreshes the list", async () => {
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue({ id: "p9", userId: "u9", status: "PENDING_ACTIVATION" });
    const user = userEvent.setup();
    renderWithQueryClient(<PatientsPage />);

    await screen.findByText(/no patients registered/i);
    await user.click(screen.getByRole("button", { name: /register patient/i }));
    await user.type(screen.getByLabelText("Full name"), "New Patient");
    await user.type(screen.getByLabelText("Email"), "newpatient@example.test");
    await user.click(screen.getByRole("button", { name: /^register patient$/i }));

    await waitFor(() => {
      expect(mockedRegister).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ hospitalId: "h1", name: "New Patient", email: "newpatient@example.test" }),
      );
    });
  });

  it("opens a read-only Medical History modal with allergies, conditions and consultations", async () => {
    mockedList.mockResolvedValue([
      {
        id: "p1",
        userId: "u2",
        dateOfBirth: null,
        gender: null,
        bloodGroup: null,
        addressLine1: null,
        city: null,
        registeredHospitalId: "h1",
        registeredBranchId: null,
        user: { id: "u2", name: "Alice Kumar", email: "alice@example.test", phone: null, status: "ACTIVE" },
        registeredHospital: null,
        registeredBranch: null,
      },
    ]);
    (medicalRecordsApi.list as jest.Mock).mockResolvedValue([
      { type: "CONSULTATION", id: "c1", date: "2026-08-02T09:00:00.000Z", hospitalId: "h1", status: "COMPLETED", doctor: { id: "d1", name: "Dr. Patel" }, department: "Cardiology", diagnoses: [{ icd10Code: "I10", description: "Hypertension" }] },
    ]);
    (medicalRecordsApi.allergies as jest.Mock).mockResolvedValue([{ id: "a1", allergen: "Penicillin", reaction: "Rash", severity: "SEVERE" }]);
    (medicalRecordsApi.conditions as jest.Mock).mockResolvedValue([{ id: "k1", name: "Asthma", status: "CHRONIC", diagnosedDate: null, notes: null }]);
    const user = userEvent.setup();
    renderWithQueryClient(<PatientsPage />);

    await user.click(await screen.findByRole("button", { name: /medical history/i }));

    expect(await screen.findByText(/Penicillin — SEVERE/)).toBeInTheDocument();
    expect(screen.getByText(/Asthma — CHRONIC/)).toBeInTheDocument();
    expect(await screen.findByText(/Dr\. Patel · Hypertension/)).toBeInTheDocument();
    expect(medicalRecordsApi.list).toHaveBeenCalledWith("token", "p1");
  });
});
