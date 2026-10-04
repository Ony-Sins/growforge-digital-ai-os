/** GrowForge's four Overview instrument marks; decorative, never activity indicators. */
export function OverviewInstrument({kind}:{kind:'mission'|'service'|'activity'|'action'}) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='mission'&&<><path d="M7 5h13l5 5v17H7zM20 5v6h5M11 15h9M11 20h5"/><path d="M3 11v10M29 15v8"/><circle cx="20" cy="21" r="2"/></>}
    {kind==='service'&&<><path d="M6 6v20M16 9v17M26 6v20M6 16h10M16 21h10"/><circle cx="6" cy="10" r="2.5" fill="#08202d"/><circle cx="16" cy="16" r="2.5" fill="#08202d"/><circle cx="26" cy="21" r="2.5" fill="#08202d"/></>}
    {kind==='activity'&&<><path d="M5 8h5l4 8h6l3 8h4M5 24h4M23 8h4"/><circle cx="6" cy="8" r="2"/><circle cx="16" cy="16" r="2"/><circle cx="26" cy="24" r="2"/></>}
    {kind==='action'&&<><path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6M10 16h12M16 10v12"/><path d="m20 12 4 4-4 4"/></>}
  </svg>;
}
