import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import { PrescriptionsPanel } from "./prescriptions-panel";
import { prescriptionsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ accessToken: "token", user: { id: "u1", roles: ["DOCTOR"], permissions: [] } }) }));
jest.mock("@/lib/resources", () => ({ prescriptionsApi: { list: jest.fn(), medications: jest.fn(), create: jest.fn(), pdfUrl: jest.fn() } }));
jest.mock("@/lib/api-client");

const api = prescriptionsApi as unknown as Record<"list" | "medications" | "create", jest.Mock>;

const existing = {
  id: "rx1",
  consultationId: "c1",
  status: "ACTIVE",
  items: [{ id: "i1", freeTextName: "Amoxicillin", dosage: "250mg", frequency: "daily", durationDays: 5, instructions: null, quantity: null, medication: null }],
};

describe("PrescriptionsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.list.mockResolvedValue([]);
    api.medications.mockResolvedValue([]);
  });

  it("issues a prescription with a free-text medication", async () => {
    api.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<PrescriptionsPanel consultationId="c1" patientId="p1" canWrite />);

    await user.click(screen.getByRole("button", { name: "+ Add Medication" }));
    await user.type(screen.getByLabelText("Medication"), "ORS");
    await user.type(screen.getByLabelText("Dosage"), "1 sachet");
    await user.type(screen.getByLabelText("Frequency"), "as needed");
    await user.click(screen.getByRole("button", { name: "Issue Prescription" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith("token", {
        consultationId: "c1",
        items: [{ freeTextName: "ORS", dosage: "1 sachet", frequency: "as needed" }],
      }),
    );
  });

  it("keeps Issue disabled until dosage and frequency are filled", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PrescriptionsPanel consultationId="c1" patientId="p1" canWrite />);
    await user.click(screen.getByRole("button", { name: "+ Add Medication" }));
    await user.type(screen.getByLabelText("Medication"), "ORS");
    expect(screen.getByRole("button", { name: "Issue Prescription" })).toBeDisabled();
  });

  it("corrects an active prescription by issuing one that supersedes it - there is no edit in place", async () => {
    api.list.mockResolvedValue([existing]);
    api.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<PrescriptionsPanel consultationId="c1" patientId="p1" canWrite />);

    await user.click(await screen.findByRole("button", { name: "Correct" }));
    const dosage = screen.getByLabelText("Dosage");
    await user.clear(dosage);
    await user.type(dosage, "500mg");
    await user.click(screen.getByRole("button", { name: "Issue Prescription" }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith("token", {
        consultationId: "c1",
        supersedesId: "rx1",
        items: [{ freeTextName: "Amoxicillin", dosage: "500mg", frequency: "daily", durationDays: 5 }],
      }),
    );
  });

  it("is read-only when the viewer cannot write", async () => {
    api.list.mockResolvedValue([existing]);
    renderWithQueryClient(<PrescriptionsPanel consultationId="c1" patientId="p1" canWrite={false} />);
    expect(await screen.findByText(/Amoxicillin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add Medication" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Correct" })).not.toBeInTheDocument();
  });
});
