import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, View } from "react-native";

import { palettes, type Colors, type ThemeName } from "./theme";
import { getTheme, setTheme as persistTheme } from "./utils/storage";

type ThemeContextValue = {
  theme: ThemeName;
  resolvedTheme: "dark" | "light";
  colors: Colors;
  setTheme: (theme: ThemeName) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(choice: ThemeName): "dark" | "light" {
  if (choice === "system") {
    return Appearance.getColorScheme() === "light" ? "light" : "dark";
  }
  return choice;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");
  const [systemScheme, setSystemScheme] = useState<"dark" | "light">(
    Appearance.getColorScheme() === "light" ? "light" : "dark",
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getTheme().then((stored) => {
      setThemeState(stored);
      setReady(true);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "light" ? "light" : "dark");
    });
    return () => sub.remove();
  }, []);

  const resolvedTheme = theme === "system" ? systemScheme : resolveTheme(theme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      colors: palettes[resolvedTheme],
      setTheme: async (next) => {
        setThemeState(next);
        await persistTheme(next);
      },
    }),
    [theme, resolvedTheme],
  );

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: palettes.dark.bg }} />;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
