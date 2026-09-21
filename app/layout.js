import "./globals.css";

export const metadata = {
  title: "Forge",
  description: "Shared AI workforce for Korben OS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
