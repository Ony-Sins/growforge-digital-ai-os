"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { SpatialGraphData } from "@/lib/spatial/obsidianReader";
import { departmentRecords, type DepartmentRecord } from "./departmentModel";
import { LensHeader } from "./LensHeader";
import { LensState } from "./LensState";
import { useLensContentStart } from "./useLensContentStart";
import styles from "./DepartmentsLens.module.css";

export function DepartmentsLens({
  closing,
  onClose,
  onInspect,
  dismissalVersion,
}: {
  closing: boolean;
  onClose: () => void;
  onInspect: () => void;
  dismissalVersion: number;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  useLensContentStart(fieldRef);
  const [graph, setGraph] = useState<SpatialGraphData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const selected = selection?.version === dismissalVersion ? selection.id : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/spatial/graph", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!result.ok) throw new Error();
        if (!controller.signal.aborted) setGraph(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  const records = useMemo(() => departmentRecords(graph), [graph]);
  const record = records.find((item) => item.taxon.id === selected);
  const select = (item: DepartmentRecord) => {
    onInspect();
    setSelection({ id: item.taxon.id, version: dismissalVersion });
  };

  const operating = records.filter((item) => item.taxon.kind === "department").length;
  const oversightCount = records.filter((item) => item.taxon.kind === "oversight").length;
  return (
    <>
    <LensHeader lensId="lens.departments" metrics={[{ label: "operating departments", value: operating }, { label: "oversight", value: oversightCount }]} />
    <div ref={fieldRef} className={styles.field} data-departments-lens>
      <div className={styles.departments} data-dive-inspector aria-label="Operating departments">
        {records
          .filter((item) => item.taxon.kind === "department")
          .map((item) => (
            <button
              key={item.taxon.id}
              aria-pressed={selected === item.taxon.id}
              onClick={() => select(item)}
              data-department-id={item.taxon.id}
            >
              <span>{item.taxon.name}</span>
              <ChevronRight size={12} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ))}
      </div>
      <div className={styles.oversight} aria-label="Oversight">
        <span>Oversight</span>
        {records
          .filter((item) => item.taxon.kind === "oversight")
          .map((item) => (
            <button
              key={item.taxon.id}
              aria-pressed={selected === item.taxon.id}
              onClick={() => select(item)}
              data-oversight-id={item.taxon.id}
            >
              <span>{item.taxon.name}</span>
              <ChevronRight size={12} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ))}
      </div>
      {record && (
        <DepartmentInspection
          key={record.taxon.id}
          record={record}
          unavailable={unavailable}
          closing={closing}
          onClose={onClose}
        />
      )}
    </div>
    </>
  );
}

function DepartmentInspection({
  record,
  unavailable,
  closing,
  onClose,
}: {
  record: DepartmentRecord;
  unavailable: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  const [category, setCategory] = useState("Purpose");
  // Foundation areas are always present so structure never depends on data; each says what is true.
  const areaContent = (name: string): string[] | undefined => (name === "Handoffs" ? record.categories.Relationships : record.categories[name]);
  const categories = [
    "Purpose",
    "Current Work",
    "Agents",
    "Tools",
    "Handoffs",
    ...["Workflows", "Capabilities", "Knowledge"].filter((name) => record.categories[name]?.length),
  ];

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("growforge:department-context", {
        detail: {
          departmentId: record.taxon.id,
          title: record.taxon.name,
          kind: record.taxon.kind,
          context: JSON.stringify({
            purpose: record.categories.Purpose?.[0] ?? null,
            relationships: record.categories.Relationships ?? [],
            sourceRecordId: record.node?.id ?? null,
          }).slice(0, 2000),
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("growforge:department-context", { detail: null })
      );
    };
  }, [record]);

  return (
    <aside
      className={`${styles.inspector} surface-glass ${closing ? styles.dissolving : ""}`}
      data-dive-inspector
      data-nora-side-inspector
      aria-label="Department inspection"
      aria-hidden={closing}
      inert={closing ? true : undefined}
    >
      <button
        className={styles.close}
        onClick={onClose}
        aria-label="Dismiss department inspection"
      >
        <X size={14} aria-hidden="true" />
      </button>
      <p className={styles.eyebrow}>
        {record.taxon.kind === "oversight" ? "OVERSIGHT RECORD" : "OPERATING DEPARTMENT"}
      </p>
      <h2>{record.taxon.name}</h2>
      {categories.length > 0 ? (
        <>
          <div
            className={styles.categories}
            role="tablist"
            aria-label="Department inspection categories"
          >
            {categories.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={category === name}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            className={styles.content}
            aria-label={`${category} details`}
          >
            {areaContent(category)?.length ? (
              areaContent(category)!.map((text) => <p key={text}>{text}</p>)
            ) : (
              <LensState
                compact
                kind="unavailable"
                message={
                  category === "Current Work"
                    ? "Work is not tracked per department yet. Missions record their departments individually."
                    : unavailable
                    ? "Source information unavailable."
                    : `No ${category.toLowerCase()} recorded for this department.`
                }
              />
            )}
          </div>
        </>
      ) : (
        <p className={styles.content}>
          {unavailable
            ? "Source information unavailable."
            : "No descriptive source records available."}
        </p>
      )}
      {record.categories.Source && record.categories.Source.length > 0 && (
        <details className={styles.provenance}>
          <summary>
            Provenance <ChevronRight size={11} aria-hidden="true" />
          </summary>
          <div className={styles.content}>
            {record.categories.Source.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </details>
      )}
    </aside>
  );
}


