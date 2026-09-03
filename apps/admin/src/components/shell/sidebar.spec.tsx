import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/lib/auth-provider";

jest.mock("next/navigation", () => ({ usePathname: () => "/branches" }));
jest.mock("@/lib/auth-provider", () => ({ useAuth: jest.fn() }));

const mockedUseAuth = useAuth as jest.Mock;

describe("Sidebar", () => {
  it("renders only nav items the user's permissions unlock", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "u1", name: "Nina", hospitalId: "h1", roles: ["NURSE"], permissions: ["branches.read"] },
    });
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Branches" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Departments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("renders every module for an Admin with full permissions", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u2",
        name: "Priya",
        hospitalId: "h1",
        roles: ["ADMIN"],
        permissions: ["branches.read", "departments.read", "users.read"],
      },
    });
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Branches" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Departments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });
});
