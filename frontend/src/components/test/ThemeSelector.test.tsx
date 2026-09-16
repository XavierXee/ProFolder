import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeSelector } from "../ThemeSelector.js";

// NOTE (jsdom limitation, per the project notes): jsdom does not implement layout/rendering, so these
// tests prove DOM structure/ARIA/event-handling/class-name correctness only — they do NOT prove
// the resulting colors actually render as intended for each theme.

describe("ThemeSelector", () => {
  it("renders closed with the trigger's visible text reflecting the current value", () => {
    render(<ThemeSelector value="dark" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Theme" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Dark");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the ProFolder label on the trigger when value is profolder", () => {
    render(<ThemeSelector value="profolder" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Theme" })).toHaveTextContent("ProFolder");
  });

  it("shows the Light label on the trigger when value is light", () => {
    render(<ThemeSelector value="light" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Theme" })).toHaveTextContent("Light");
  });

  it("renders all 3 options in the correct order when opened", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector value="profolder" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("ProFolder");
    expect(options[1]).toHaveTextContent("Light");
    expect(options[2]).toHaveTextContent("Dark");
  });

  it("marks the currently-selected option as aria-selected and shows the checkmark only on it", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector value="dark" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));

    const profolderOpt = screen.getByRole("option", { name: "ProFolder" });
    const lightOpt = screen.getByRole("option", { name: "Light" });
    const darkOpt = screen.getByRole("option", { name: /Dark/ });

    expect(darkOpt).toHaveAttribute("aria-selected", "true");
    expect(profolderOpt).toHaveAttribute("aria-selected", "false");
    expect(lightOpt).toHaveAttribute("aria-selected", "false");

    // The checkmark is rendered as aria-hidden text content alongside the selected option only.
    expect(darkOpt.textContent).toContain("✓");
    expect(profolderOpt.textContent).not.toContain("✓");
    expect(lightOpt.textContent).not.toContain("✓");
  });

  it("clicking the ProFolder option calls onChange with 'profolder' and closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeSelector value="dark" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: "ProFolder" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("profolder");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking the Light option calls onChange with 'light' and closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeSelector value="profolder" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: "Light" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("light");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking the Dark option calls onChange with 'dark' and closes the dropdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeSelector value="profolder" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: /Dark/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown on an outside click without calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ThemeSelector value="profolder" onChange={onChange} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByTestId("outside"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes the dropdown on Escape without calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeSelector value="profolder" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has aria-label='Theme' on the trigger", () => {
    render(<ThemeSelector value="profolder" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-label", "Theme");
  });

  it("uses token utility classes rather than hardcoded isDark-binary literals for trigger and menu styling", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector value="dark" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Theme" });
    expect(trigger.className).toContain("border-border");
    expect(trigger.className).toContain("text-ink-muted");
    // Old hardcoded-isDark literals must be gone for good.
    expect(trigger.className).not.toContain("border-white/10");
    expect(trigger.className).not.toContain("text-slate-300");
    expect(trigger.className).not.toContain("border-slate-300");
    expect(trigger.className).not.toContain("text-slate-600");

    await user.click(trigger);
    const menu = screen.getByRole("listbox");
    expect(menu.className).toContain("bg-surface");
    expect(menu.className).toContain("border-border");
    expect(menu.className).not.toContain("bg-[#181b24]");
    expect(menu.className).not.toContain("bg-white");
    expect(menu.className).not.toContain("border-slate-200");

    // Dark's selected-option color is asserted separately below (contrast test) since it
    // deliberately does NOT use text-accent — see that test for why.
    const selectedOption = screen.getByRole("option", { name: /Dark/ });
    expect(selectedOption.className).not.toContain("text-blue-700");
  });

  // Regression guard for a real WCAG 1.4.3 finding: --color-accent resolves to #2563eb (raw
  // blue) under the dark theme, which is only ~3.33:1 against --color-surface's #181b24 — below
  // the 4.5:1 AA threshold for normal text. profolder (#FADF82 on #242422, ~11.8:1) and light
  // (#2563eb on #ffffff, ~5.17:1) both clear AA using text-accent directly, so only dark needs
  // the swap to the lighter text-blue-400 (~6.77:1 against #181b24) that the rest of this
  // codebase already uses for readable text on the dark surface (see
  // MultiSelectDropdown.tsx's triggerActiveCls).
  it("uses the higher-contrast text-blue-400 (not text-accent) for the selected option under the dark theme specifically, while profolder/light keep text-accent", async () => {
    const user = userEvent.setup();

    const { unmount: unmountDark } = render(<ThemeSelector value="dark" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Theme" }));
    const darkSelected = screen.getByRole("option", { name: /Dark/ });
    expect(darkSelected.className).toContain("text-blue-400");
    expect(darkSelected.className).not.toContain("text-accent");
    unmountDark();

    const { unmount: unmountProfolder } = render(<ThemeSelector value="profolder" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Theme" }));
    const profolderSelected = screen.getByRole("option", { name: "ProFolder" });
    expect(profolderSelected.className).toContain("text-accent");
    expect(profolderSelected.className).not.toContain("text-blue-400");
    unmountProfolder();

    render(<ThemeSelector value="light" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Theme" }));
    const lightSelected = screen.getByRole("option", { name: "Light" });
    expect(lightSelected.className).toContain("text-accent");
    expect(lightSelected.className).not.toContain("text-blue-400");
  });
});
