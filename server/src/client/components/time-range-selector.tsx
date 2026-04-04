"use client";

import { useEffect, useRef, useState } from "react";
import { FeatherCalendar, FeatherClock } from "@subframe/core";
import { Calendar } from "@/src/ui/components/Calendar";
import { ToggleGroup } from "@/src/ui/components/ToggleGroup";
import { formatTimeInput, formatCustomLabel } from "@/src/client/lib/format";
import type { TimeRange, TimeRangePreset } from "@/src/client/lib/types";
import { TIME_RANGE_PRESETS } from "@/src/client/lib/types";

export function TimeRangeSelector({
    timeRange,
    onPresetChange,
    onCustomRange,
}: {
    timeRange: TimeRange;
    onPresetChange: (preset: TimeRangePreset) => void;
    onCustomRange: (from: Date, to: Date) => void;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [pendingFrom, setPendingFrom] = useState<Date>(timeRange.from);
    const [pendingTo, setPendingTo] = useState<Date>(timeRange.to);
    const [hasFullRange, setHasFullRange] = useState(true);
    const [showTimeInputs, setShowTimeInputs] = useState(false);
    const [fromTime, setFromTime] = useState(formatTimeInput(timeRange.from));
    const [toTime, setToTime] = useState(formatTimeInput(timeRange.to));

    useEffect(() => {
        setPendingFrom(timeRange.from);
        setPendingTo(timeRange.to);
        setFromTime(formatTimeInput(timeRange.from));
        setToTime(formatTimeInput(timeRange.to));
        setHasFullRange(true);
    }, [timeRange]);

    useEffect(() => {
        if (!showPicker) return;
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowPicker(false);
                setShowTimeInputs(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showPicker]);

    const applyTimeToDate = (date: Date, time: string): Date => {
        const [h, m] = time.split(":").map(Number);
        const d = new Date(date);
        d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
        return d;
    };

    const handleDateSelect = (
        _range: { from?: Date; to?: Date } | undefined,
        triggerDay: Date,
    ) => {
        if (hasFullRange) {
            setPendingFrom(triggerDay);
            setPendingTo(triggerDay);
            setHasFullRange(false);
        } else {
            if (triggerDay < pendingFrom) {
                setPendingFrom(triggerDay);
                setPendingTo(pendingFrom);
            } else {
                setPendingTo(triggerDay);
            }
            setHasFullRange(true);
        }
    };

    const handleApply = () => {
        let from: Date;
        let to: Date;
        if (showTimeInputs) {
            from = applyTimeToDate(pendingFrom, fromTime);
            to = applyTimeToDate(pendingTo, toTime);
        } else {
            from = new Date(pendingFrom);
            from.setHours(0, 0, 0, 0);
            to = new Date(pendingTo);
            to.setHours(23, 59, 59, 999);
        }
        if (from < to) {
            onCustomRange(from, to);
        }
        setShowPicker(false);
        setShowTimeInputs(false);
    };

    const calendarLabel =
        timeRange.preset === "custom"
            ? formatCustomLabel(timeRange.from, timeRange.to)
            : "Custom";

    const pendingFromDate = pendingFrom.toLocaleDateString([], { month: "short", day: "numeric" });
    const pendingToDate = pendingTo.toLocaleDateString([], { month: "short", day: "numeric" });
    const selectionLabel =
        pendingFromDate === pendingToDate
            ? pendingFromDate
            : `${pendingFromDate} – ${pendingToDate}`;

    return (
        <div className="flex items-center gap-3">
            <ToggleGroup
                value={timeRange.preset === "custom" ? "" : timeRange.preset}
                onValueChange={(value) => {
                    if (value) onPresetChange(value as TimeRangePreset);
                }}
            >
                {TIME_RANGE_PRESETS.map((p) => (
                    <ToggleGroup.Item key={p.value} value={p.value} icon={null}>
                        {p.label}
                    </ToggleGroup.Item>
                ))}
            </ToggleGroup>
            <div className="relative" ref={popoverRef}>
                <button
                    type="button"
                    onClick={() => setShowPicker(!showPicker)}
                    className={`flex items-center gap-2 rounded-md border border-solid px-3 py-1.5 text-caption font-caption transition-colors ${
                        timeRange.preset === "custom"
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-neutral-border bg-default-background text-subtext-color hover:bg-neutral-200"
                    }`}
                >
                    <FeatherCalendar className="h-3.5 w-3.5" />
                    <span>{calendarLabel}</span>
                </button>
                {showPicker ? (
                    <div className="absolute right-0 top-full z-10 mt-1 flex flex-col rounded-md border border-solid border-neutral-border bg-default-background shadow-lg">
                        <div className="p-4">
                            <Calendar
                                mode="range"
                                selected={{ from: pendingFrom, to: pendingTo }}
                                onSelect={handleDateSelect}
                            />
                        </div>
                        <div className="flex flex-col gap-3 border-t border-solid border-neutral-200 px-4 py-3">
                            <div className="flex items-center justify-between">
                                <span className="text-caption font-caption text-subtext-color">
                                    {selectionLabel}
                                </span>
                                {!showTimeInputs ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowTimeInputs(true)}
                                        className="flex items-center gap-1 text-caption font-caption text-subtext-color hover:text-default-font transition-colors"
                                    >
                                        <FeatherClock className="h-3 w-3" />
                                        Set times
                                    </button>
                                ) : null}
                            </div>
                            {showTimeInputs ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <FeatherClock className="h-3.5 w-3.5 text-neutral-400" />
                                        <input
                                            type="time"
                                            value={fromTime}
                                            onChange={(e) => setFromTime(e.target.value)}
                                            className="w-[90px] rounded border border-solid border-neutral-border bg-default-background px-2 py-1 text-caption font-caption text-default-font outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <span className="text-caption text-neutral-400">to</span>
                                    <div className="flex items-center gap-1.5">
                                        <FeatherClock className="h-3.5 w-3.5 text-neutral-400" />
                                        <input
                                            type="time"
                                            value={toTime}
                                            onChange={(e) => setToTime(e.target.value)}
                                            className="w-[90px] rounded border border-solid border-neutral-border bg-default-background px-2 py-1 text-caption font-caption text-default-font outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleApply}
                                disabled={!hasFullRange}
                                className="w-full rounded-md bg-brand-600 py-1.5 text-caption font-caption text-white transition-colors hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
