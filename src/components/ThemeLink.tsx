"use client";

import { useState } from "react";

export function ThemeLink() {
  const [active, setActive] = useState(false);

  function toggleTheme() {
    const page = document.querySelector(".simple-drop-page");
    page?.classList.toggle("theme-mutated");
    setActive((value) => !value);
  }

  return (
    <button className="simple-footer-link" type="button" onClick={toggleTheme} aria-pressed={active}>
      theme
    </button>
  );
}
