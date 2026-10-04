"use client";

import { useState } from "react";
import type { DiveObject } from "./overviewModel";
import { MissionInspector } from "./MissionInspector";
import styles from "./DiveOverview.module.css";

export function MissionLens({ missions, selectedRecord, selectedId, closing, onSelect, onClose }: {
  missions: DiveObject[]; selectedRecord: DiveObject | null; selectedId: string | null; closing: boolean;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(missions.length / 4) - 1);
  const currentPage = Math.min(page, lastPage);
  const selected = selectedRecord ?? missions.find(mission => mission.id === selectedId);
  const visible = selected ? [selected] : missions.slice(currentPage * 4, currentPage * 4 + 4);
  return <>
    {visible.map((mission, index) => <div key={mission.id} className={styles.missionAnchor} style={{ left: visible.length === 1 ? "50%" : `${15 + index * 70 / (visible.length - 1)}%` }}>
      <button className={`${styles.node} ${styles.missionNode}`} aria-pressed={!closing && selectedId === mission.id} aria-label={`Inspect mission ${mission.name}`} onClick={() => onSelect(mission.id)}>
        <span className={styles.nodeMark} aria-hidden /><span>{mission.name}</span><small>{mission.status}</small>
      </button>
      {selected?.id === mission.id && <MissionInspector key={mission.id} mission={mission} closing={closing} onClose={onClose} />}
    </div>)}
    {!selected && lastPage > 0 && <div className={styles.missionPaging} aria-label="Active mission groups">
      <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {lastPage + 1}</span><button disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</button>
    </div>}
  </>;
}
