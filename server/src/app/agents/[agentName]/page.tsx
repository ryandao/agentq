import { AgentDetailPageView } from "@/src/client/client";

export default function AgentDetailPage({
    params,
}: {
    params: { agentName: string };
}) {
    return <AgentDetailPageView agentName={decodeURIComponent(params.agentName)} />;
}
