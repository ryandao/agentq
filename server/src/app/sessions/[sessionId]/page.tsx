import { SessionDetailPageView } from "@/src/client/client";

export default async function SessionDetailPage({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const { sessionId } = await params;
    return <SessionDetailPageView sessionId={decodeURIComponent(sessionId)} />;
}
