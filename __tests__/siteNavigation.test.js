import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SiteNav from "../components/layout/site/SiteNav";
import SiteFooter from "../components/layout/site/SiteFooter";
import PageHeader from "../components/layout/site/PageHeader";
import StatusMessage from "../components/layout/site/StatusMessage";
import { SITE_AREAS, activeAreaKey, isPublicPath } from "../components/layout/site/siteNavigation";

let pathname = "/";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

const MAJOR_AREAS = {
  Home: "/",
  Forecast: "/forecastinfo",
  "Level history": "/history",
  "High-water events": "/history/events",
  "Water quality": "/waterquality",
  "Trent gauges": "/trentweirs",
  Alerts: "/alerts",
};

describe("site navigation", () => {
  beforeEach(() => { pathname = "/"; });

  test("links to every major public area from any page", () => {
    pathname = "/waterquality";
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const [label, href] of Object.entries(MAJOR_AREAS)) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    expect(within(nav).getByRole("link", { name: "Is HPP Open?" })).toHaveAttribute("href", "/");
  });

  test.each([
    ["/", "Home"],
    ["/history", "Level history"],
    ["/history/events", "High-water events"],
    ["/history/events/2024-01-02T03:00:00Z", "High-water events"],
    ["/waterquality", "Water quality"],
    ["/forecastinfo", "Forecast"],
    ["/trentweirs", "Trent gauges"],
    ["/trentlock", "Trent gauges"],
    ["/alerts", "Alerts"],
  ])("marks %s as the current area (%s) and nothing else", (path, label) => {
    pathname = path;
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const current = within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  test("the mobile menu button toggles the collapsible menu", async () => {
    const user = userEvent.setup();
    render(<SiteNav />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-controls", "site-nav-menu");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("site-nav-menu")).toHaveClass("show");
    // Choosing a destination closes the menu so it never covers the page it opens.
    await user.click(screen.getByRole("link", { name: "Water quality" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("offers a skip link to the page content", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#content");
  });

  test("stays out of the admin area, which has its own bar", () => {
    pathname = "/admin/events";
    const { container } = render(<><SiteNav /><SiteFooter /></>);
    expect(container).toBeEmptyDOMElement();
    expect(isPublicPath("/administrator")).toBe(true);
  });

  test("unknown paths have no current area", () => {
    expect(activeAreaKey("/worlds")).toBeNull();
    expect(activeAreaKey("/historyx")).toBeNull();
    expect(activeAreaKey(undefined)).toBeNull();
    expect(SITE_AREAS.map((area) => area.href)).toEqual(Object.values(MAJOR_AREAS));
  });
});

describe("site footer", () => {
  test("keeps independence, guidance and data attribution without implying water safety", async () => {
    const user = userEvent.setup();
    render(<SiteFooter />);
    expect(screen.getByText(/not associated with the National Water Sports Centre/)).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee that HPP is open/)).toBeInTheDocument();
    await user.click(screen.getByText("About this site and its data"));
    expect(screen.getByText(/cannot tell you whether it is safe/)).toBeInTheDocument();
    expect(screen.getByText(/Environment Agency flood and river level data/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log a Trent Lock session" })).toHaveAttribute("href", "/trentlock");
  });
});

describe("page header", () => {
  test("renders one page title with optional breadcrumb, eyebrow, lead and actions", () => {
    render(<PageHeader title="High-water event" eyebrow="Observed" lead="Short summary."
      breadcrumb={[{ href: "/history", label: "Level history" }]}><a href="/x">Action</a></PageHeader>);
    expect(screen.getByRole("heading", { level: 1, name: "High-water event" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Level history" })).toHaveAttribute("href", "/history");
    expect(screen.getByText("Short summary.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Action" })).toBeInTheDocument();
  });
});

describe("status message", () => {
  test.each([
    ["loading", "status"],
    ["empty", "status"],
    ["stale", "status"],
    ["unavailable", "status"],
    ["error", "alert"],
  ])("%s states are distinct and announced as %s", (state, role) => {
    render(<StatusMessage state={state} title="Title.">Body text</StatusMessage>);
    const message = screen.getByRole(role);
    expect(message).toHaveAttribute("data-state", state);
    expect(message).toHaveClass(`site-state--${state}`);
    expect(message).toHaveTextContent("Title. Body text");
  });

  test("never adds a numeric placeholder of its own", () => {
    render(<StatusMessage state="loading">Loading the latest level…</StatusMessage>);
    expect(screen.getByRole("status").textContent).not.toMatch(/\d/);
  });
});
