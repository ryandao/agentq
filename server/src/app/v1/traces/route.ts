import { NextResponse } from "next/server";
import { ingestOTLP } from "@/src/server/otlp";
import { decodeOtlpProtobuf } from "@/src/server/otlp-decode";
import type { OTLPExportTraceServiceRequest } from "@/src/server/otlp";

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") ?? "";
        let body: OTLPExportTraceServiceRequest;

        if (
            contentType.includes("application/x-protobuf") ||
            contentType.includes("application/protobuf")
        ) {
            const buf = new Uint8Array(await request.arrayBuffer());
            body = decodeOtlpProtobuf(buf);
        } else {
            body = (await request.json()) as OTLPExportTraceServiceRequest;
        }

        if (!body.resourceSpans?.length) {
            return NextResponse.json({});
        }

        await ingestOTLP(body);
        return NextResponse.json({});
    } catch (err) {
        if (err instanceof SyntaxError) {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 },
            );
        }
        console.error("OTLP ingest error:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
