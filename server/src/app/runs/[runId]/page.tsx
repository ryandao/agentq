import { RunDetailPageView } from "@/src/client/client";

export default function RunDetailPage({
    params,
}: {
    params: { runId: string };
}) {
    return <RunDetailPageView runId={params.runId} />;
}
