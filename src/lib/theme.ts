// Tema claro/escuro do app. Aplica a classe `.dark` na raiz (padrão shadcn/
// Tailwind) e persiste a escolha no localStorage. Sem dependências de UI.
export type Theme = "light" | "dark";

const KEY = "rm-theme";

export function getTheme(): Theme {
  if (typeof localStorage === "undefined") return "light";
  const v = localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
