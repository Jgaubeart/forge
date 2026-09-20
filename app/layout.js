export const metadata = {
  title: "Forge",
  description: "Shared AI workforce for Korben OS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#0b0d10", color: "#f5f7fa" }}>
        {children}
      </body>
    </html>
  );
}
