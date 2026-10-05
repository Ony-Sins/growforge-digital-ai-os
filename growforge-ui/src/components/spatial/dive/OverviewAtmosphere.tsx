import styles from "./OverviewAtmosphere.module.css";

/**
 * Overview environment: large-scale light only, built as layered gradients with no scripted drawing. Three apparent depths:
 * FAR (near-black with a very few soft out-of-focus lights and faint shafts), MID (restrained blue-black haze around NORA)
 * and NEAR (abstract reflected light beneath NORA). Light is shaped to fall off from NORA's position, so most of the
 * screen stays dark. No floor, horizon, grid, lines, particle field or scenery, and nothing here encodes data. Decorative only.
 */
export function OverviewAtmosphere() {
  return (
    <div className={styles.atmosphere} aria-hidden="true" data-overview-optical-background data-overview-atmosphere>
      <div className={styles.base} />
      <div className={styles.bokeh} />
      <div className={styles.shafts} />
      <div className={styles.haze} />
      <div className={styles.source} />
      <div className={styles.reflection} />
      <div className={styles.streaks} />
      <div className={styles.grain} />
      <div className={styles.vignette} />
    </div>
  );
}
