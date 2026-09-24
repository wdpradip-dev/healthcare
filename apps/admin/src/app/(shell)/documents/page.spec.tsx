import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/lib/test-utils";
import DocumentsPage from "./page";
import { documentsApi } from "@/lib/resources";

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ accessToken: "token", user: { id: "u1", roles: ["ADMIN"], permissions: ["documents.read"] } }),
}));
jest.mock("@/lib/resources", () => ({ documentsApi: { list: jest.fn(), downloadUrl: jest.fn() } }));
jest.mock("@/lib/api-client");
jest.mock("@/components/appointments/appointment-details-modal", () => ({ formatDateTime: () => "1 Sep 2026" }));

const list = documentsApi.list as jest.Mock;
const downloadUrl = documentsApi.downloadUrl as jest.Mock;

describe("DocumentsPage", () => {
  it("opens a document through a signed URL", async () => {
    list.mockResolvedValue([{ id: "d1", fileName: "scan.png", category: "ID_PROOF", sizeBytes: 2048, createdAt: "2026-09-01T00:00:00Z" }]);
    downloadUrl.mockResolvedValue({ url: "https://files.test/x" });
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    renderWithQueryClient(<DocumentsPage />);

    await user.click(await screen.findByRole("button", { name: "scan.png" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.test/x", "_blank", "noopener,noreferrer"));
    expect(downloadUrl).toHaveBeenCalledWith("token", "d1");
    open.mockRestore();
  });

  it("shows an empty state", async () => {
    list.mockResolvedValue([]);
    renderWithQueryClient(<DocumentsPage />);
    expect(await screen.findByText("No documents found.")).toBeInTheDocument();
  });
});
