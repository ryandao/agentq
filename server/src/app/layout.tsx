import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ObservabilityAppShell } from "@/src/client/client";
import { ThemeProvider } from "@/src/client/theme-provider";

export const metadata: Metadata = {
    title: "AgentQ Observability",
    description:
        "Top-level observability console for runs, workers, queues, sessions, and config.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" data-theme="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
                    rel="stylesheet"
                />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem("agentq-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
                    }}
                />
            </head>

            <body>
                <ThemeProvider>
                    <ObservabilityAppShell>{children}</ObservabilityAppShell>
                </ThemeProvider>
            </body>
        </html>
    );
}
