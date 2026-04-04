/**
 * Decode OTLP protobuf (application/x-protobuf) into the same JSON shape
 * that the OTLP HTTP/JSON encoding produces, so the rest of the ingest
 * pipeline can stay format-agnostic.
 */

import protobuf from "protobufjs";
import type { OTLPExportTraceServiceRequest } from "./otlp";

const PROTO = `
syntax = "proto3";

message ExportTraceServiceRequest {
  repeated ResourceSpans resource_spans = 1;
}

message ResourceSpans {
  Resource resource = 1;
  repeated ScopeSpans scope_spans = 2;
}

message Resource {
  repeated KeyValue attributes = 1;
}

message ScopeSpans {
  InstrumentationScope scope = 1;
  repeated Span spans = 2;
}

message InstrumentationScope {
  string name = 1;
  string version = 2;
}

message Span {
  bytes trace_id = 1;
  bytes span_id = 2;
  string trace_state = 3;
  bytes parent_span_id = 4;
  string name = 5;
  int32 kind = 6;
  fixed64 start_time_unix_nano = 7;
  fixed64 end_time_unix_nano = 8;
  repeated KeyValue attributes = 9;
  uint32 dropped_attributes_count = 10;
  repeated Event events = 11;
  uint32 dropped_events_count = 12;
  // field 13 = links (skipped)
  // field 14 = dropped_links_count (skipped)
  Status status = 15;
}

message Status {
  string message = 2;
  int32 code = 3;
}

message Event {
  fixed64 time_unix_nano = 1;
  string name = 2;
  repeated KeyValue attributes = 3;
}

message KeyValue {
  string key = 1;
  AnyValue value = 2;
}

message AnyValue {
  oneof value {
    string string_value = 1;
    bool bool_value = 2;
    int64 int_value = 3;
    double double_value = 4;
    ArrayValue array_value = 5;
    KeyValueList kvlist_value = 6;
    bytes bytes_value = 7;
  }
}

message ArrayValue {
  repeated AnyValue values = 1;
}

message KeyValueList {
  repeated KeyValue values = 1;
}
`;

const root = protobuf.parse(PROTO).root;
const ExportTraceServiceRequest = root.lookupType(
    "ExportTraceServiceRequest",
);

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

function bufToHex(buf: Uint8Array | Buffer | number[] | string): string {
    if (typeof buf === "string") {
        return Buffer.from(buf, "base64").toString("hex");
    }
    return Buffer.from(buf as unknown as ArrayBuffer).toString("hex");
}

// ---------------------------------------------------------------------------
// Public decoder
// ---------------------------------------------------------------------------

export function decodeOtlpProtobuf(
    buffer: Uint8Array,
): OTLPExportTraceServiceRequest {
    const message = ExportTraceServiceRequest.decode(buffer);
    const raw = ExportTraceServiceRequest.toObject(message, {
        longs: String,
        defaults: true,
    }) as RawRequest;

    return {
        resourceSpans: (raw.resourceSpans ?? []).map(convertResourceSpans),
    };
}

// ---------------------------------------------------------------------------
// Internal raw types (from protobufjs toObject — camelCase, bytes as Buffer)
// ---------------------------------------------------------------------------

type RawRequest = { resourceSpans?: RawResourceSpans[] };
type RawResourceSpans = {
    resource?: { attributes?: RawKV[] };
    scopeSpans?: RawScopeSpans[];
};
type RawScopeSpans = {
    scope?: { name?: string; version?: string };
    spans?: RawSpan[];
};
type RawSpan = {
    traceId: Uint8Array | Buffer;
    spanId: Uint8Array | Buffer;
    parentSpanId?: Uint8Array | Buffer;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes?: RawKV[];
    events?: RawEvent[];
    status?: { code?: number; message?: string };
};
type RawEvent = {
    timeUnixNano: string;
    name: string;
    attributes?: RawKV[];
};
type RawKV = { key: string; value?: RawAnyValue };
type RawAnyValue = {
    stringValue?: string;
    boolValue?: boolean;
    intValue?: string;
    doubleValue?: number;
    arrayValue?: { values?: RawAnyValue[] };
    kvlistValue?: { values?: RawKV[] };
    bytesValue?: Uint8Array | Buffer;
};

// ---------------------------------------------------------------------------
// Converters — protobufjs raw → OTLP JSON shape
// ---------------------------------------------------------------------------

function convertResourceSpans(rs: RawResourceSpans) {
    return {
        resource: rs.resource
            ? { attributes: convertKVList(rs.resource.attributes) }
            : undefined,
        scopeSpans: (rs.scopeSpans ?? []).map((ss) => ({
            scope: ss.scope ? { name: ss.scope.name } : undefined,
            spans: (ss.spans ?? []).map(convertSpan),
        })),
    };
}

function convertSpan(s: RawSpan) {
    const parentHex = s.parentSpanId ? bufToHex(s.parentSpanId) : undefined;
    return {
        traceId: bufToHex(s.traceId),
        spanId: bufToHex(s.spanId),
        parentSpanId:
            parentHex && parentHex !== "0000000000000000"
                ? parentHex
                : undefined,
        name: s.name,
        kind: s.kind,
        startTimeUnixNano: s.startTimeUnixNano,
        endTimeUnixNano: s.endTimeUnixNano,
        attributes: convertKVList(s.attributes),
        events: (s.events ?? []).map(convertEvent),
        status: s.status
            ? { code: s.status.code, message: s.status.message }
            : undefined,
    };
}

function convertEvent(ev: RawEvent) {
    return {
        name: ev.name,
        timeUnixNano: ev.timeUnixNano,
        attributes: convertKVList(ev.attributes),
    };
}

function convertKVList(kvs: RawKV[] | undefined) {
    if (!kvs?.length) return [];
    return kvs.map((kv) => ({
        key: kv.key,
        value: convertAnyValue(kv.value),
    }));
}

function convertAnyValue(v: RawAnyValue | undefined): Record<string, unknown> {
    if (!v) return {};
    if (v.stringValue !== undefined && v.stringValue !== "")
        return { stringValue: v.stringValue };
    if (v.boolValue !== undefined && v.boolValue !== false)
        return { boolValue: v.boolValue };
    if (v.intValue !== undefined && v.intValue !== "0")
        return { intValue: v.intValue };
    if (v.doubleValue !== undefined && v.doubleValue !== 0)
        return { doubleValue: v.doubleValue };
    if (v.arrayValue?.values?.length)
        return {
            arrayValue: { values: v.arrayValue.values.map(convertAnyValue) },
        };
    if (v.kvlistValue?.values?.length)
        return { kvlistValue: { values: convertKVList(v.kvlistValue.values) } };
    if (v.stringValue !== undefined) return { stringValue: v.stringValue };
    if (v.intValue !== undefined) return { intValue: v.intValue };
    if (v.doubleValue !== undefined) return { doubleValue: v.doubleValue };
    if (v.boolValue !== undefined) return { boolValue: v.boolValue };
    return {};
}
